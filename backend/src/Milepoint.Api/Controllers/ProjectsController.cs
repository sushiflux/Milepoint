using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Projects;
using Milepoint.Api.Models;

namespace Milepoint.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/projects")]
public class ProjectsController : ControllerBase
{
    private readonly PmDbContextBase _db;
    private readonly UserManager<ApplicationUser> _userManager;

    public ProjectsController(PmDbContextBase db, UserManager<ApplicationUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    [HttpGet]
    public async Task<ActionResult<List<ProjectDto>>> GetAll()
    {
        var currentUserId = _userManager.GetUserId(User);
        var seesAllProjects = User.IsInRole("Projektleiter") || User.IsInRole("Admin");

        var projectsQuery = _db.Projects.AsQueryable();
        if (!seesAllProjects)
        {
            projectsQuery = projectsQuery.Where(p =>
                p.CreatedByUserId == currentUserId ||
                p.Members.Any(m => m.UserId == currentUserId) ||
                _db.WorkItems.Any(w => w.ProjectId == p.Id && w.AssigneeId == currentUserId));
        }

        var projects = await projectsQuery.Include(p => p.CreatedByUser).OrderBy(p => p.Name).ToListAsync();
        var projectIds = projects.Select(p => p.Id).ToList();

        var items = await _db.WorkItems
            .Where(w => projectIds.Contains(w.ProjectId))
            .Include(w => w.Column)
            .ToListAsync();
        var itemsByProject = items.ToLookup(w => w.ProjectId);

        // One board per project (see BoardsController) - used for the open-tickets-by-column
        // breakdown, keyed on whichever board is oldest in the (now practically impossible)
        // case more than one exists.
        var boards = await _db.Boards
            .Where(b => projectIds.Contains(b.ProjectId))
            .Include(b => b.Columns)
            .OrderBy(b => b.CreatedAt)
            .ToListAsync();
        var boardByProject = boards.ToLookup(b => b.ProjectId);

        var now = DateTimeOffset.UtcNow;
        var upcomingMilestones = await _db.Milestones
            .Where(m => projectIds.Contains(m.ProjectId) && m.Date >= now)
            .OrderBy(m => m.Date)
            .ToListAsync();
        var nextMilestoneByProject = upcomingMilestones.ToLookup(m => m.ProjectId);

        var memberRows = await _db.ProjectMembers
            .Where(m => projectIds.Contains(m.ProjectId))
            .Include(m => m.User)
            .ToListAsync();
        var membersByProject = memberRows.ToLookup(m => m.ProjectId);

        var favoriteProjectIds = (await _db.ProjectFavorites
            .Where(f => projectIds.Contains(f.ProjectId) && f.UserId == currentUserId)
            .Select(f => f.ProjectId)
            .ToListAsync())
            .ToHashSet();

        var dtos = projects
            .Select(p => ToDto(
                p,
                itemsByProject[p.Id].ToList(),
                currentUserId,
                nextMilestoneByProject[p.Id].FirstOrDefault(),
                BuildMembers(p, membersByProject[p.Id]),
                boardByProject[p.Id].FirstOrDefault(),
                favoriteProjectIds.Contains(p.Id)))
            .ToList();
        return Ok(dtos);
    }

    [HttpPost]
    public async Task<ActionResult<ProjectDto>> Create(CreateProjectRequest request)
    {
        var currentUserId = _userManager.GetUserId(User);
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var project = new Project
        {
            Name = request.Name,
            Description = request.Description,
            CreatedByUserId = currentUserId
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        // A default board, so Timeline task/phase creation always has a column to land in - no
        // "create a board first" detour before the project is usable. No longer auto-creates a
        // root note named after the project - explicit user request: inside a project's own Notes
        // graph, a node named after the project itself is redundant (the whole graph already IS
        // that project), so it just added noise instead of being a useful "natural center".
        var board = new Board
        {
            ProjectId = project.Id,
            Name = "Board",
            Columns = BoardsController.DefaultColumns
                .Select((c, index) => new BoardColumn { Name = c.Name, Order = index, Type = c.Type, IsDefault = true })
                .ToList()
        };
        _db.Boards.Add(board);
        await _db.SaveChangesAsync();

        var currentUser = await _userManager.GetUserAsync(User);
        var owner = new ProjectMemberSummaryDto(currentUserId, currentUser?.DisplayName ?? string.Empty);
        var dto = ToDto(project, [], currentUserId, null, [owner], board, isFavorite: false);
        return CreatedAtAction(nameof(GetAll), dto);
    }

    [HttpPatch("{projectId}")]
    public async Task<ActionResult<ProjectDto>> Rename(string projectId, UpdateProjectRequest request)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId);
        if (project is null)
        {
            return NotFound();
        }

        if (!await CanManageProjectAsync(project))
        {
            return Forbid();
        }

        project.Name = request.Name;
        await _db.SaveChangesAsync();
        await _db.Entry(project).Reference(p => p.CreatedByUser).LoadAsync();

        var currentUserId = _userManager.GetUserId(User);
        var items = await _db.WorkItems.Where(w => w.ProjectId == projectId).Include(w => w.Column).ToListAsync();

        var now = DateTimeOffset.UtcNow;
        var nextMilestone = await _db.Milestones
            .Where(m => m.ProjectId == projectId && m.Date >= now)
            .OrderBy(m => m.Date)
            .FirstOrDefaultAsync();

        var members = await _db.ProjectMembers.Where(m => m.ProjectId == projectId).Include(m => m.User).ToListAsync();

        var board = await _db.Boards.Where(b => b.ProjectId == projectId).Include(b => b.Columns).OrderBy(b => b.CreatedAt).FirstOrDefaultAsync();

        var isFavorite = currentUserId is not null &&
            await _db.ProjectFavorites.AnyAsync(f => f.ProjectId == projectId && f.UserId == currentUserId);

        return Ok(ToDto(project, items, currentUserId, nextMilestone, BuildMembers(project, members), board, isFavorite));
    }

    [HttpDelete("{projectId}")]
    public async Task<IActionResult> Delete(string projectId)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId);
        if (project is null)
        {
            return NotFound();
        }

        if (!await CanManageProjectAsync(project))
        {
            return Forbid();
        }

        var workItemIds = await _db.WorkItems.Where(w => w.ProjectId == projectId).Select(w => w.Id).ToListAsync();
        var noteIds = await _db.Notes.Where(n => n.ProjectId == projectId).Select(n => n.Id).ToListAsync();
        var labelIds = await _db.Labels.Where(l => l.ProjectId == projectId).Select(l => l.Id).ToListAsync();

        // WorkItem.ParentWorkItemId is Restrict, and WorkItemDependency / NoteLink / the
        // WorkItemLabel join table are all NoAction on their WorkItem/Note/Label FKs (see
        // PmDbContextBase - avoids SQL Server's multi-cascade-path error). None of that is
        // cleaned up by the Project -> Board -> BoardColumn -> WorkItem / Project -> Note
        // cascade, so it has to be cleared explicitly or the delete is rejected with an FK
        // violation for any project that has dependencies, subtasks, note links or labels.
        await _db.WorkItems
            .Where(w => w.ProjectId == projectId && w.ParentWorkItemId != null)
            .ExecuteUpdateAsync(s => s.SetProperty(w => w.ParentWorkItemId, (string?)null));

        // Milestone.ParentWorkItemId is NoAction too (same reasoning) - MilestoneDependencies
        // don't need the same treatment since their own WorkItemId side isn't in play here and
        // the MilestoneId side cascades.
        await _db.Milestones
            .Where(m => m.ProjectId == projectId && m.ParentWorkItemId != null)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.ParentWorkItemId, (string?)null));

        await _db.WorkItemDependencies
            .Where(d => workItemIds.Contains(d.DependentWorkItemId) || workItemIds.Contains(d.BlockingWorkItemId))
            .ExecuteDeleteAsync();

        await _db.NoteLinks
            .Where(l => noteIds.Contains(l.SourceNoteId) || noteIds.Contains(l.TargetNoteId))
            .ExecuteDeleteAsync();

        await _db.Set<Dictionary<string, object>>("WorkItemLabel")
            .Where(x => workItemIds.Contains(EF.Property<string>(x, "WorkItemsId")) || labelIds.Contains(EF.Property<Guid>(x, "LabelsId")))
            .ExecuteDeleteAsync();

        _db.Projects.Remove(project);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{projectId}/members")]
    public async Task<IActionResult> AddMember(string projectId, AddProjectMemberRequest request)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId);
        if (project is null)
        {
            return NotFound();
        }

        if (!await CanManageProjectAsync(project))
        {
            return Forbid();
        }

        var user = await _userManager.FindByNameAsync(request.Username);
        if (user is null)
        {
            return NotFound("Kein User mit diesem Benutzernamen gefunden.");
        }

        var alreadyMember = await _db.ProjectMembers.AnyAsync(m => m.ProjectId == projectId && m.UserId == user.Id);
        if (!alreadyMember)
        {
            _db.ProjectMembers.Add(new ProjectMember { ProjectId = projectId, UserId = user.Id });
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpDelete("{projectId}/members/{userId}")]
    public async Task<IActionResult> RemoveMember(string projectId, string userId)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId);
        if (project is null)
        {
            return NotFound();
        }

        if (!await CanManageProjectAsync(project))
        {
            return Forbid();
        }

        var membership = await _db.ProjectMembers.FirstOrDefaultAsync(m => m.ProjectId == projectId && m.UserId == userId);
        if (membership is not null)
        {
            _db.ProjectMembers.Remove(membership);
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpPost("{projectId}/favorite")]
    public async Task<IActionResult> AddFavorite(string projectId)
    {
        var currentUserId = _userManager.GetUserId(User);
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId);
        if (project is null)
        {
            return NotFound();
        }

        if (!await CanSeeProjectAsync(project, currentUserId))
        {
            return Forbid();
        }

        var alreadyFavorite = await _db.ProjectFavorites.AnyAsync(f => f.ProjectId == projectId && f.UserId == currentUserId);
        if (!alreadyFavorite)
        {
            _db.ProjectFavorites.Add(new ProjectFavorite { ProjectId = projectId, UserId = currentUserId });
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpDelete("{projectId}/favorite")]
    public async Task<IActionResult> RemoveFavorite(string projectId)
    {
        var currentUserId = _userManager.GetUserId(User);
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var favorite = await _db.ProjectFavorites.FirstOrDefaultAsync(f => f.ProjectId == projectId && f.UserId == currentUserId);
        if (favorite is not null)
        {
            _db.ProjectFavorites.Remove(favorite);
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }

    private async Task<bool> CanManageProjectAsync(Project project)
    {
        if (User.IsInRole("Projektleiter") || User.IsInRole("Admin"))
        {
            return true;
        }

        var currentUserId = _userManager.GetUserId(User);
        return project.CreatedByUserId == currentUserId;
    }

    // Mirrors GetAll's visibility filter for a single project - used so favoriting can't be used
    // to probe/associate yourself with a project you otherwise have no relation to.
    private async Task<bool> CanSeeProjectAsync(Project project, string? currentUserId)
    {
        if (User.IsInRole("Projektleiter") || User.IsInRole("Admin"))
        {
            return true;
        }

        if (project.CreatedByUserId == currentUserId)
        {
            return true;
        }

        if (await _db.ProjectMembers.AnyAsync(m => m.ProjectId == project.Id && m.UserId == currentUserId))
        {
            return true;
        }

        return await _db.WorkItems.AnyAsync(w => w.ProjectId == project.Id && w.AssigneeId == currentUserId);
    }

    private static List<ProjectMemberSummaryDto> BuildMembers(Project project, IEnumerable<ProjectMember> members)
    {
        var list = new List<ProjectMemberSummaryDto> { new(project.CreatedByUserId, project.CreatedByUser?.DisplayName ?? string.Empty) };
        list.AddRange(members
            .Where(m => m.UserId != project.CreatedByUserId)
            .Select(m => new ProjectMemberSummaryDto(m.UserId, m.User.DisplayName)));
        return list;
    }

    // Same "open ticket" population BuildColumnCounts's non-Done columns add up to - Tasks (not
    // Phases) sitting in a column that isn't Done.
    private static IEnumerable<WorkItem> OpenTasks(IEnumerable<WorkItem> items) =>
        items.Where(w => w.Type == WorkItemType.Task && w.Column.Type != BoardColumnType.Done);

    private static (int Timeline, int KanbanOnly) SplitTimelineVsKanban(IEnumerable<WorkItem> items)
    {
        var list = items as ICollection<WorkItem> ?? items.ToList();
        var timeline = list.Count(w => w.StartDate is not null || w.DueDate is not null);
        return (timeline, list.Count - timeline);
    }

    private static List<ColumnTicketCountDto> BuildColumnCounts(Board? board, IEnumerable<WorkItem> items)
    {
        if (board is null)
        {
            return [];
        }

        var tasksByColumn = items
            .Where(w => w.Type == WorkItemType.Task)
            .GroupBy(w => w.ColumnId)
            .ToDictionary(g => g.Key, g => g.ToList());

        return board.Columns
            .Where(c => c.Type != BoardColumnType.Done)
            .OrderBy(c => c.Order)
            .Select(c =>
            {
                var columnTasks = tasksByColumn.GetValueOrDefault(c.Id, []);
                var (timeline, kanbanOnly) = SplitTimelineVsKanban(columnTasks);
                return new ColumnTicketCountDto(c.Name, columnTasks.Count, timeline, kanbanOnly);
            })
            .ToList();
    }

    private static ProjectDto ToDto(
        Project project,
        List<WorkItem> items,
        string? currentUserId,
        Milestone? nextMilestone,
        List<ProjectMemberSummaryDto> members,
        Board? board,
        bool isFavorite)
    {
        var isOwner = project.CreatedByUserId == currentUserId;

        var myTasks = items.Where(w =>
            w.Type == WorkItemType.Task &&
            w.AssigneeId == currentUserId).ToList();

        var myAssignedTaskCount = myTasks.Count;
        var myCompletedTaskCount = myTasks.Count(w => w.Column.Type == BoardColumnType.Done);

        double completionPercent;
        if (isOwner)
        {
            completionPercent = items.Count == 0
                ? 0
                : (double)items.Count(w => w.Column.Type == BoardColumnType.Done) / items.Count * 100;
        }
        else
        {
            completionPercent = myAssignedTaskCount == 0
                ? 0
                : (double)myCompletedTaskCount / myAssignedTaskCount * 100;
        }

        var lastActivityAt = items.Count == 0 ? project.CreatedAt : items.Max(w => w.UpdatedAt);

        var now = DateTimeOffset.UtcNow;
        bool IsOverdue(WorkItem w) => w.Type == WorkItemType.Task && w.Column.Type != BoardColumnType.Done && w.DueDate is not null && w.DueDate < now;
        var overdueCount = items.Count(IsOverdue);
        var myOverdueCount = myTasks.Count(IsOverdue);

        var barScope = isOwner ? items : myTasks;
        var (timelineItemCount, kanbanOnlyItemCount) = SplitTimelineVsKanban(barScope);
        var (openTimelineCount, openKanbanOnlyCount) = SplitTimelineVsKanban(OpenTasks(items));
        var (myOpenTimelineCount, myOpenKanbanOnlyCount) = SplitTimelineVsKanban(OpenTasks(myTasks));

        return new ProjectDto(
            project.Id,
            project.Name,
            project.Description,
            project.CreatedAt,
            isOwner,
            isFavorite,
            Math.Round(completionPercent, 1),
            timelineItemCount,
            kanbanOnlyItemCount,
            BuildColumnCounts(board, items),
            BuildColumnCounts(board, myTasks),
            openTimelineCount,
            openKanbanOnlyCount,
            myOpenTimelineCount,
            myOpenKanbanOnlyCount,
            overdueCount,
            myOverdueCount,
            lastActivityAt,
            nextMilestone?.Name,
            nextMilestone?.Date,
            members);
    }
}
