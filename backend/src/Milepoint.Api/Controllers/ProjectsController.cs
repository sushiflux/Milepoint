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
        var seesAllProjects = User.IsInRole("Projektleiter");

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

        var dtos = projects
            .Select(p => ToDto(
                p,
                itemsByProject[p.Id].ToList(),
                currentUserId,
                nextMilestoneByProject[p.Id].FirstOrDefault(),
                BuildMembers(p, membersByProject[p.Id])))
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

        // Every project starts with a root note named after the project itself, so the
        // Notes graph always has a natural center to link everything else from.
        _db.Notes.Add(new Note
        {
            ProjectId = project.Id,
            Title = project.Name,
            Content = string.Empty
        });

        // ...and a default board, so Timeline task/phase creation always has a column to land
        // in - no "create a board first" detour before the project is usable.
        _db.Boards.Add(new Board
        {
            ProjectId = project.Id,
            Name = "Board",
            Columns = BoardsController.DefaultColumns
                .Select((c, index) => new BoardColumn { Name = c.Name, Order = index, Type = c.Type })
                .ToList()
        });
        await _db.SaveChangesAsync();

        var currentUser = await _userManager.GetUserAsync(User);
        var owner = new ProjectMemberSummaryDto(currentUserId, currentUser?.DisplayName ?? string.Empty);
        var dto = ToDto(project, [], currentUserId, null, [owner]);
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

        return Ok(ToDto(project, items, currentUserId, nextMilestone, BuildMembers(project, members)));
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

    private async Task<bool> CanManageProjectAsync(Project project)
    {
        if (User.IsInRole("Projektleiter"))
        {
            return true;
        }

        var currentUserId = _userManager.GetUserId(User);
        return project.CreatedByUserId == currentUserId;
    }

    private static List<ProjectMemberSummaryDto> BuildMembers(Project project, IEnumerable<ProjectMember> members)
    {
        var list = new List<ProjectMemberSummaryDto> { new(project.CreatedByUserId, project.CreatedByUser?.DisplayName ?? string.Empty) };
        list.AddRange(members
            .Where(m => m.UserId != project.CreatedByUserId)
            .Select(m => new ProjectMemberSummaryDto(m.UserId, m.User.DisplayName)));
        return list;
    }

    private static ProjectDto ToDto(
        Project project,
        List<WorkItem> items,
        string? currentUserId,
        Milestone? nextMilestone,
        List<ProjectMemberSummaryDto> members)
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

        var openTicketCount = items.Count(w => w.Column.Type != BoardColumnType.Done);
        var lastActivityAt = items.Count == 0 ? project.CreatedAt : items.Max(w => w.UpdatedAt);

        return new ProjectDto(
            project.Id,
            project.Name,
            project.Description,
            project.CreatedAt,
            isOwner,
            myAssignedTaskCount,
            myCompletedTaskCount,
            Math.Round(completionPercent, 1),
            openTicketCount,
            lastActivityAt,
            nextMilestone?.Name,
            nextMilestone?.Date,
            members);
    }
}
