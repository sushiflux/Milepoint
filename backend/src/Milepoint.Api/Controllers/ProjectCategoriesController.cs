using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.ProjectCategories;
using Milepoint.Api.Models;

namespace Milepoint.Api.Controllers;

[ApiController]
[Authorize]
public class ProjectCategoriesController : ControllerBase
{
    private readonly PmDbContextBase _db;

    public ProjectCategoriesController(PmDbContextBase db)
    {
        _db = db;
    }

    [HttpGet("api/project-categories")]
    public async Task<ActionResult<List<ProjectCategoryDto>>> GetAll()
    {
        var categories = await _db.ProjectCategories
            .OrderBy(c => c.Name)
            .Select(c => new ProjectCategoryDto(c.Id, c.Code, c.Name, c.CreatedAt))
            .ToListAsync();

        return Ok(categories);
    }

    [HttpPost("api/admin/project-categories")]
    [Authorize(Roles = "SystemAdmin,Admin")]
    public async Task<ActionResult<ProjectCategoryDto>> Create(CreateProjectCategoryRequest request)
    {
        var category = new ProjectCategory
        {
            Code = request.Code.Trim().ToUpperInvariant(),
            Name = request.Name.Trim()
        };

        _db.ProjectCategories.Add(category);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAll), new ProjectCategoryDto(category.Id, category.Code, category.Name, category.CreatedAt));
    }

    [HttpPut("api/admin/project-categories/{id:guid}")]
    [Authorize(Roles = "SystemAdmin,Admin")]
    public async Task<IActionResult> Update(Guid id, UpdateProjectCategoryRequest request)
    {
        var category = await _db.ProjectCategories.FindAsync(id);
        if (category is null)
        {
            return NotFound();
        }

        category.Code = request.Code.Trim().ToUpperInvariant();
        category.Name = request.Name.Trim();
        await _db.SaveChangesAsync();

        return NoContent();
    }

    [HttpDelete("api/admin/project-categories/{id:guid}")]
    [Authorize(Roles = "SystemAdmin,Admin")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var category = await _db.ProjectCategories.FindAsync(id);
        if (category is null)
        {
            return NotFound();
        }

        var inUse = await _db.Projects.AnyAsync(p => p.ProjectCategoryId == id);
        if (inUse)
        {
            return Conflict("Kategorie wird noch von mindestens einem Projekt verwendet.");
        }

        _db.ProjectCategories.Remove(category);
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
