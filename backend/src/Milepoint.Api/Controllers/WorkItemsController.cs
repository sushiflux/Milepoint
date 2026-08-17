using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.WorkItems;
using Milepoint.Api.Hubs;
using Milepoint.Api.Models;
using Milepoint.Api.Services;

namespace Milepoint.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/boards/{boardId}/workitems")]
public class WorkItemsController : ControllerBase
{
    private readonly PmDbContextBase _db;
    private readonly IHubContext<KanbanHub> _hub;

    public WorkItemsController(PmDbContextBase db, IHubContext<KanbanHub> hub)
    {
        _db = db;
        _hub = hub;
    }

    [HttpGet]
    public async Task<ActionResult<List<WorkItemDto>>> GetAll(string boardId)
    {
        var items = await _db.WorkItems
            .Where(w => w.BoardId == boardId)
            .Include(w => w.Assignee)
            .Include(w => w.Labels)
            .Include(w => w.Column)
            .Include(w => w.Dependencies)
            .Include(w => w.MilestoneLinks)
            .OrderBy(w => w.Position)
            .ToListAsync();

        return Ok(items.Select(WorkItemMapper.ToDto));
    }

    [HttpPost]
    public async Task<ActionResult<WorkItemDto>> Create(string boardId, CreateWorkItemRequest request)
    {
        var board = await _db.Boards
            .Include(b => b.Columns)
            .FirstOrDefaultAsync(b => b.Id == boardId);

        if (board is null)
        {
            return NotFound();
        }

        var column = board.Columns.FirstOrDefault(c => c.Id == request.ColumnId);
        if (column is null)
        {
            return BadRequest("Spalte gehört nicht zu diesem Board.");
        }

        if (request.ParentWorkItemId is not null &&
            !await _db.WorkItems.AnyAsync(w => w.Id == request.ParentWorkItemId && w.ProjectId == board.ProjectId))
        {
            return BadRequest("Übergeordnete Aufgabe gehört nicht zu diesem Projekt.");
        }

        var position = await _db.WorkItems.Where(w => w.ColumnId == column.Id).CountAsync();
        var (prefix, number) = await NextReferenceAsync(request.Type);

        var item = new WorkItem
        {
            ProjectId = board.ProjectId,
            BoardId = boardId,
            ColumnId = column.Id,
            Column = column,
            ParentWorkItemId = request.ParentWorkItemId,
            Title = request.Title,
            Description = request.Description,
            Type = request.Type,
            Priority = request.Priority,
            Category = request.Category,
            Position = position,
            ReferencePrefix = prefix,
            ReferenceNumber = number,
            StartDate = request.StartDate,
            DueDate = request.DueDate
        };

        _db.WorkItems.Add(item);
        await _db.SaveChangesAsync();

        var dto = WorkItemMapper.ToDto(item);
        await _hub.Clients.Group(KanbanHub.GroupName(boardId)).SendAsync("workItemCreated", dto);

        return CreatedAtAction(nameof(GetAll), new { boardId }, dto);
    }

    [HttpPut("{workItemId}")]
    public async Task<ActionResult<WorkItemDto>> Update(string boardId, string workItemId, UpdateWorkItemRequest request)
    {
        var item = await _db.WorkItems
            .Include(w => w.Assignee)
            .Include(w => w.Labels)
            .Include(w => w.Column)
            .Include(w => w.Dependencies)
            .Include(w => w.MilestoneLinks)
            .FirstOrDefaultAsync(w => w.Id == workItemId && w.BoardId == boardId);

        if (item is null)
        {
            return NotFound();
        }

        if (request.ParentWorkItemId == workItemId)
        {
            return BadRequest("Eine Aufgabe kann nicht ihre eigene übergeordnete Aufgabe sein.");
        }

        item.Title = request.Title;
        item.Description = request.Description;
        item.Type = request.Type;
        item.Priority = request.Priority;
        item.Category = request.Category;
        item.AssigneeId = request.AssigneeId;
        item.ParentWorkItemId = request.ParentWorkItemId;
        item.StartDate = request.StartDate;
        item.DueDate = request.DueDate;
        item.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();
        await _db.Entry(item).Reference(w => w.Assignee).LoadAsync();

        var dto = WorkItemMapper.ToDto(item);
        await _hub.Clients.Group(KanbanHub.GroupName(boardId)).SendAsync("workItemUpdated", dto);

        return Ok(dto);
    }

    [HttpPut("{workItemId}/move")]
    public async Task<IActionResult> Move(string boardId, string workItemId, MoveWorkItemRequest request)
    {
        var item = await _db.WorkItems.FirstOrDefaultAsync(w => w.Id == workItemId && w.BoardId == boardId);
        if (item is null)
        {
            return NotFound();
        }

        var targetColumn = await _db.BoardColumns.FirstOrDefaultAsync(c => c.Id == request.TargetColumnId);
        if (targetColumn is null)
        {
            return BadRequest("Zielspalte existiert nicht.");
        }

        if (targetColumn.Type != BoardColumnType.Todo)
        {
            var unfinishedBlockers = await _db.WorkItemDependencies
                .Where(d => d.DependentWorkItemId == workItemId)
                .Include(d => d.BlockingWorkItem)
                .ThenInclude(w => w.Column)
                .Where(d => d.BlockingWorkItem.Column.Type != BoardColumnType.Done)
                .Select(d => d.BlockingWorkItem.Title)
                .ToListAsync();

            if (unfinishedBlockers.Count > 0)
            {
                return Conflict($"Blockiert durch noch nicht fertige Aufgabe(n): {string.Join(", ", unfinishedBlockers)}");
            }

            var now = DateTimeOffset.UtcNow;
            var unreachedMilestones = await _db.MilestoneDependencies
                .Where(d => d.WorkItemId == workItemId && d.Direction == MilestoneDependencyDirection.MilestoneBlocksWorkItem)
                .Include(d => d.Milestone)
                .Where(d => d.Milestone.Date > now)
                .Select(d => d.Milestone.Name)
                .ToListAsync();

            if (unreachedMilestones.Count > 0)
            {
                return Conflict($"Blockiert durch noch nicht erreichte(n) Meilenstein(e): {string.Join(", ", unreachedMilestones)}");
            }
        }

        item.ColumnId = request.TargetColumnId;
        item.Position = request.Position;
        item.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();

        await _hub.Clients.Group(KanbanHub.GroupName(boardId))
            .SendAsync("workItemMoved", new { workItemId, request.TargetColumnId, request.Position });

        return NoContent();
    }

    [HttpPost("{workItemId}/dependencies")]
    public async Task<IActionResult> AddDependency(string boardId, string workItemId, AddDependencyRequest request)
    {
        var item = await _db.WorkItems.FirstOrDefaultAsync(w => w.Id == workItemId && w.BoardId == boardId);
        if (item is null)
        {
            return NotFound();
        }

        if (request.BlockingWorkItemId == workItemId)
        {
            return BadRequest("Eine Aufgabe kann nicht sich selbst blockieren.");
        }

        var blockerExists = await _db.WorkItems.AnyAsync(w => w.Id == request.BlockingWorkItemId && w.ProjectId == item.ProjectId);
        if (!blockerExists)
        {
            return BadRequest("Blockierende Aufgabe gehört nicht zu diesem Projekt.");
        }

        var exists = await _db.WorkItemDependencies.AnyAsync(d =>
            d.DependentWorkItemId == workItemId && d.BlockingWorkItemId == request.BlockingWorkItemId);

        if (!exists)
        {
            _db.WorkItemDependencies.Add(new WorkItemDependency
            {
                DependentWorkItemId = workItemId,
                BlockingWorkItemId = request.BlockingWorkItemId
            });
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpDelete("{workItemId}")]
    public async Task<IActionResult> Delete(string boardId, string workItemId)
    {
        var item = await _db.WorkItems.FirstOrDefaultAsync(w => w.Id == workItemId && w.BoardId == boardId);
        if (item is null)
        {
            return NotFound();
        }

        // Deleting a Phase/Task takes its whole subtree with it - gather every descendant level
        // by level, since WorkItem.ParentWorkItemId is Restrict (no built-in cascade to lean on).
        var subtreeIds = new List<string> { workItemId };
        var frontier = new List<string> { workItemId };
        while (frontier.Count > 0)
        {
            var children = await _db.WorkItems.Where(w => frontier.Contains(w.ParentWorkItemId!)).Select(w => w.Id).ToListAsync();
            if (children.Count == 0) break;
            subtreeIds.AddRange(children);
            frontier = children;
        }

        var milestoneIds = await _db.Milestones.Where(m => subtreeIds.Contains(m.ParentWorkItemId!)).Select(m => m.Id).ToListAsync();

        // Break the self-referencing parent links inside the subtree first (same reasoning as
        // ProjectsController.Delete) so the bulk WorkItem delete below can't hit its own Restrict FK.
        await _db.WorkItems
            .Where(w => subtreeIds.Contains(w.Id) && w.ParentWorkItemId != null)
            .ExecuteUpdateAsync(s => s.SetProperty(w => w.ParentWorkItemId, (string?)null));

        await _db.WorkItemDependencies
            .Where(d => subtreeIds.Contains(d.DependentWorkItemId) || subtreeIds.Contains(d.BlockingWorkItemId))
            .ExecuteDeleteAsync();

        // MilestoneId side of MilestoneDependency cascades on its own when the milestone rows
        // below are deleted - only the WorkItemId (NoAction) side needs clearing here, covering
        // milestones outside this subtree that referenced a task we're about to remove.
        await _db.MilestoneDependencies
            .Where(d => subtreeIds.Contains(d.WorkItemId))
            .ExecuteDeleteAsync();

        await _db.Set<Dictionary<string, object>>("WorkItemLabel")
            .Where(x => subtreeIds.Contains(EF.Property<string>(x, "WorkItemsId")))
            .ExecuteDeleteAsync();

        await _db.Milestones.Where(m => milestoneIds.Contains(m.Id)).ExecuteDeleteAsync();
        await _db.WorkItems.Where(w => subtreeIds.Contains(w.Id)).ExecuteDeleteAsync();

        await _hub.Clients.Group(KanbanHub.GroupName(boardId)).SendAsync("workItemDeleted", subtreeIds);

        return NoContent();
    }

    [HttpDelete("{workItemId}/dependencies/{blockingWorkItemId}")]
    public async Task<IActionResult> RemoveDependency(string boardId, string workItemId, string blockingWorkItemId)
    {
        var dependency = await _db.WorkItemDependencies.FirstOrDefaultAsync(d =>
            d.DependentWorkItemId == workItemId && d.BlockingWorkItemId == blockingWorkItemId);

        if (dependency is not null)
        {
            _db.WorkItemDependencies.Remove(dependency);
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }

    // Simple counter-table increment (see SequenceCounter) rather than a native DB sequence, so the
    // same code works identically on Postgres and SQL Server without provider-specific raw SQL. Good
    // enough for a single-team dev tool; revisit if ticket creation ever becomes highly concurrent.
    private async Task<(string Prefix, int Number)> NextReferenceAsync(WorkItemType type)
    {
        var counterKey = WorkItemReferenceCode.CounterKeyFor(type);
        var prefix = WorkItemReferenceCode.PrefixFor(type);

        var counter = await _db.SequenceCounters.FirstOrDefaultAsync(c => c.Key == counterKey);
        if (counter is null)
        {
            counter = new SequenceCounter { Key = counterKey, Value = 0 };
            _db.SequenceCounters.Add(counter);
        }

        counter.Value++;
        return (prefix, counter.Value);
    }
}
