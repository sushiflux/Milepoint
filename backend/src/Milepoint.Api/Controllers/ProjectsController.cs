using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Projects;
using Milepoint.Api.Models;
using Milepoint.Api.Services;

namespace Milepoint.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/projects")]
public class ProjectsController : ControllerBase
{
    private const int MaxKeyGenerationAttempts = 10;

    private readonly PmDbContextBase _db;

    public ProjectsController(PmDbContextBase db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<ProjectDto>>> GetAll()
    {
        var projects = await _db.Projects
            .Include(p => p.ProjectCategory)
            .OrderBy(p => p.Name)
            .Select(p => ToDto(p))
            .ToListAsync();

        return Ok(projects);
    }

    [HttpPost]
    public async Task<ActionResult<ProjectDto>> Create(CreateProjectRequest request)
    {
        var category = await _db.ProjectCategories.FindAsync(request.ProjectCategoryId);
        if (category is null)
        {
            return BadRequest("Unbekannte Projekt-Kategorie.");
        }

        string key;
        var attempt = 0;
        while (true)
        {
            key = $"{category.Code}#{ProjectKeySuffixGenerator.Generate()}";
            var exists = await _db.Projects.AnyAsync(p => p.Key == key);
            if (!exists)
            {
                break;
            }

            attempt++;
            if (attempt >= MaxKeyGenerationAttempts)
            {
                return Conflict("Konnte keinen eindeutigen Projekt-Key generieren, bitte erneut versuchen.");
            }
        }

        var project = new Project
        {
            Key = key,
            Name = request.Name,
            Description = request.Description,
            ProjectCategoryId = category.Id,
            ProjectCategory = category
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAll), ToDto(project));
    }

    private static ProjectDto ToDto(Project project) => new(
        project.Id,
        project.Key,
        project.Name,
        project.Description,
        project.CreatedAt,
        project.ProjectCategoryId,
        project.ProjectCategory.Name);
}
