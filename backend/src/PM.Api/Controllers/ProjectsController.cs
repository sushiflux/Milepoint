using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PM.Api.Data;
using PM.Api.Dtos.Projects;
using PM.Api.Models;

namespace PM.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/projects")]
public class ProjectsController : ControllerBase
{
    private readonly PmDbContextBase _db;

    public ProjectsController(PmDbContextBase db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<ProjectDto>>> GetAll()
    {
        var projects = await _db.Projects
            .OrderBy(p => p.Name)
            .Select(p => new ProjectDto(p.Id, p.Key, p.Name, p.Description, p.CreatedAt))
            .ToListAsync();

        return Ok(projects);
    }

    [HttpPost]
    public async Task<ActionResult<ProjectDto>> Create(CreateProjectRequest request)
    {
        var project = new Project
        {
            Key = request.Key.ToUpperInvariant(),
            Name = request.Name,
            Description = request.Description
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        var dto = new ProjectDto(project.Id, project.Key, project.Name, project.Description, project.CreatedAt);
        return CreatedAtAction(nameof(GetAll), dto);
    }
}
