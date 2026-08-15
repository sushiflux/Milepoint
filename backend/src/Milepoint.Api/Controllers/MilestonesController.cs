using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Milestones;
using Milepoint.Api.Models;
using Milepoint.Api.Services;

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
            .Include(m => m.WorkItemLinks)
            .OrderBy(m => m.Date)
            .ToListAsync();

        return Ok(milestones.Select(MilestoneMapper.ToDto));
    }

    [HttpPost]
    public async Task<ActionResult<MilestoneDto>> Create(string projectId, CreateMilestoneRequest request)
    {
        var projectExists = await _db.Projects.AnyAsync(p => p.Id == projectId);
        if (!projectExists)
        {
            return NotFound();
        }

        if (request.ParentWorkItemId is not null &&
            !await _db.WorkItems.AnyAsync(w => w.Id == request.ParentWorkItemId && w.ProjectId == projectId))
        {
            return BadRequest("Übergeordnete Aufgabe gehört nicht zu diesem Projekt.");
        }

        var milestone = new Milestone
        {
            ProjectId = projectId,
            Name = request.Name,
            Description = request.Description,
            Date = request.Date,
            ParentWorkItemId = request.ParentWorkItemId
        };

        _db.Milestones.Add(milestone);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAll), new { projectId }, MilestoneMapper.ToDto(milestone));
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

    [HttpPost("{milestoneId}/dependencies")]
    public async Task<IActionResult> AddDependency(string projectId, string milestoneId, AddMilestoneDependencyRequest request)
    {
        var milestone = await _db.Milestones.FirstOrDefaultAsync(m => m.Id == milestoneId && m.ProjectId == projectId);
        if (milestone is null)
        {
            return NotFound();
        }

        var workItemExists = await _db.WorkItems.AnyAsync(w => w.Id == request.WorkItemId && w.ProjectId == projectId);
        if (!workItemExists)
        {
            return BadRequest("Aufgabe gehört nicht zu diesem Projekt.");
        }

        var exists = await _db.MilestoneDependencies.AnyAsync(d => d.MilestoneId == milestoneId && d.WorkItemId == request.WorkItemId);
        if (!exists)
        {
            _db.MilestoneDependencies.Add(new MilestoneDependency
            {
                MilestoneId = milestoneId,
                WorkItemId = request.WorkItemId,
                Direction = request.Direction
            });
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpDelete("{milestoneId}/dependencies/{workItemId}")]
    public async Task<IActionResult> RemoveDependency(string projectId, string milestoneId, string workItemId)
    {
        var dependency = await _db.MilestoneDependencies.FirstOrDefaultAsync(d => d.MilestoneId == milestoneId && d.WorkItemId == workItemId);
        if (dependency is not null)
        {
            _db.MilestoneDependencies.Remove(dependency);
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }
}
