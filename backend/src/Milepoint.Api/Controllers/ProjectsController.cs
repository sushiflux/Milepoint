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

        var projects = await projectsQuery.OrderBy(p => p.Name).ToListAsync();
        var projectIds = projects.Select(p => p.Id).ToList();

        var items = await _db.WorkItems
            .Where(w => projectIds.Contains(w.ProjectId))
            .Include(w => w.Column)
            .ToListAsync();

        var itemsByProject = items.ToLookup(w => w.ProjectId);

        var dtos = projects.Select(p => ToDto(p, itemsByProject[p.Id].ToList(), currentUserId)).ToList();
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

        var dto = ToDto(project, [], currentUserId);
        return CreatedAtAction(nameof(GetAll), dto);
    }

    [HttpPost("{projectId}/members")]
    public async Task<IActionResult> AddMember(string projectId, AddProjectMemberRequest request)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId);
        if (project is null)
        {
            return NotFound();
        }

        if (!await CanManageMembersAsync(project))
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

        if (!await CanManageMembersAsync(project))
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

    private async Task<bool> CanManageMembersAsync(Project project)
    {
        if (User.IsInRole("Projektleiter"))
        {
            return true;
        }

        var currentUserId = _userManager.GetUserId(User);
        return project.CreatedByUserId == currentUserId;
    }

    private static ProjectDto ToDto(Project project, List<WorkItem> items, string? currentUserId)
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

        return new ProjectDto(
            project.Id,
            project.Name,
            project.Description,
            project.CreatedAt,
            isOwner,
            myAssignedTaskCount,
            myCompletedTaskCount,
            Math.Round(completionPercent, 1));
    }
}
