using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using PM.Api.Data;
using PM.Api.Dtos.WorkItems;
using PM.Api.Hubs;
using PM.Api.Models;

namespace PM.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/boards/{boardId:guid}/workitems")]
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
    public async Task<ActionResult<List<WorkItemDto>>> GetAll(Guid boardId)
    {
        var items = await _db.WorkItems
            .Where(w => w.BoardId == boardId)
            .Include(w => w.Assignee)
            .Include(w => w.Labels)
            .OrderBy(w => w.Position)
            .ToListAsync();

        return Ok(items.Select(ToDto));
    }

    [HttpPost]
    public async Task<ActionResult<WorkItemDto>> Create(Guid boardId, CreateWorkItemRequest request)
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

        var position = await _db.WorkItems.Where(w => w.ColumnId == column.Id).CountAsync();

        var item = new WorkItem
        {
            ProjectId = board.ProjectId,
            BoardId = boardId,
            ColumnId = column.Id,
            Title = request.Title,
            Description = request.Description,
            Type = request.Type,
            Priority = request.Priority,
            Position = position
        };

        _db.WorkItems.Add(item);
        await _db.SaveChangesAsync();

        var dto = ToDto(item);
        await _hub.Clients.Group(KanbanHub.GroupName(boardId.ToString())).SendAsync("workItemCreated", dto);

        return CreatedAtAction(nameof(GetAll), new { boardId }, dto);
    }

    [HttpPut("{workItemId:guid}/move")]
    public async Task<IActionResult> Move(Guid boardId, Guid workItemId, MoveWorkItemRequest request)
    {
        var item = await _db.WorkItems.FirstOrDefaultAsync(w => w.Id == workItemId && w.BoardId == boardId);
        if (item is null)
        {
            return NotFound();
        }

        item.ColumnId = request.TargetColumnId;
        item.Position = request.Position;
        item.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync();

        await _hub.Clients.Group(KanbanHub.GroupName(boardId.ToString()))
            .SendAsync("workItemMoved", new { workItemId, request.TargetColumnId, request.Position });

        return NoContent();
    }

    private static WorkItemDto ToDto(WorkItem item) => new(
        item.Id,
        item.ColumnId,
        item.Title,
        item.Description,
        item.Type,
        item.Priority,
        item.Position,
        item.AssigneeId,
        item.Assignee?.DisplayName,
        item.DueDate,
        item.CreatedAt,
        item.UpdatedAt,
        item.Labels.Select(l => l.Id).ToList());
}
