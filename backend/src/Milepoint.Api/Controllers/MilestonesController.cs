using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Milestones;
using Milepoint.Api.Models;

namespace Milepoint.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/projects/{projectId}/milestones")]
public class MilestonesController : ControllerBase
{
    private readonly PmDbContextBase _db;

    public MilestonesController(PmDbContextBase db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<MilestoneDto>>> GetAll(string projectId)
    {
        var milestones = await _db.Milestones
            .Where(m => m.ProjectId == projectId)
            .OrderBy(m => m.Date)
            .Select(m => new MilestoneDto(m.Id, m.Name, m.Description, m.Date, m.CreatedAt))
            .ToListAsync();

        return Ok(milestones);
    }

    [HttpPost]
    public async Task<ActionResult<MilestoneDto>> Create(string projectId, CreateMilestoneRequest request)
    {
        var projectExists = await _db.Projects.AnyAsync(p => p.Id == projectId);
        if (!projectExists)
        {
            return NotFound();
        }

        var milestone = new Milestone
        {
            ProjectId = projectId,
            Name = request.Name,
            Description = request.Description,
            Date = request.Date
        };

        _db.Milestones.Add(milestone);
        await _db.SaveChangesAsync();

        var dto = new MilestoneDto(milestone.Id, milestone.Name, milestone.Description, milestone.Date, milestone.CreatedAt);
        return CreatedAtAction(nameof(GetAll), new { projectId }, dto);
    }

    [HttpDelete("{milestoneId}")]
    public async Task<IActionResult> Delete(string projectId, string milestoneId)
    {
        var milestone = await _db.Milestones.FirstOrDefaultAsync(m => m.Id == milestoneId && m.ProjectId == projectId);
        if (milestone is null)
        {
            return NotFound();
        }

        _db.Milestones.Remove(milestone);
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
