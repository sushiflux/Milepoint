using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Milestones;
using Milepoint.Api.Dtos.Timeline;
using Milepoint.Api.Services;

namespace Milepoint.Api.Controllers;

// Project-wide view across all of a project's boards - what the Timeline tab renders. Kept separate
// from WorkItemsController (which is scoped per-board for the Kanban tab) to avoid overloading one
// controller with two different aggregation levels.
[ApiController]
[Authorize]
[Route("api/projects/{projectId}/timeline")]
public class TimelineController : ControllerBase
{
    private readonly PmDbContextBase _db;

    public TimelineController(PmDbContextBase db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<TimelineDto>> Get(string projectId)
    {
        var items = await _db.WorkItems
            .Where(w => w.ProjectId == projectId)
            .Include(w => w.Assignee)
            .Include(w => w.Labels)
            .Include(w => w.Column)
            .Include(w => w.Dependencies)
            .OrderBy(w => w.CreatedAt)
            .ToListAsync();

        var milestones = await _db.Milestones
            .Where(m => m.ProjectId == projectId)
            .OrderBy(m => m.Date)
            .Select(m => new MilestoneDto(m.Id, m.Name, m.Description, m.Date, m.CreatedAt))
            .ToListAsync();

        return Ok(new TimelineDto(items.Select(WorkItemMapper.ToDto).ToList(), milestones));
    }
}
