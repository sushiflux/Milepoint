using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.Boards;
using Milepoint.Api.Models;
using Milepoint.Api.Services;

namespace Milepoint.Api.Controllers;

// Work-item categories ("Typ") of one project. Everybody who works in the project can read them;
// only Projektleiter and Admin may add, rename, hide or delete (server-side rule, the UI mirrors
// it). Feature/Bug/Chore are built in per project and can only be hidden/shown.
[ApiController]
[Authorize]
[Route("api/projects/{projectId}/categories")]
public class ProjectCategoriesController : ControllerBase
{
    private const string ManageRoles = "Projektleiter,Admin";

    private readonly PmDbContextBase _db;

    public ProjectCategoriesController(PmDbContextBase db)
    {
        _db = db;
    }

    private static ProjectCategoryDto ToDto(ProjectCategory c) => new(c.Id, c.Name, c.Color, c.IsDefault, c.IsHidden, c.Order);

    private static bool ValidName(string? name, out string trimmed, out string error)
    {
        trimmed = name?.Trim() ?? string.Empty;
        error = string.Empty;
        if (trimmed.Length == 0) { error = "Bitte einen Namen für die Kategorie angeben."; return false; }
        if (trimmed.Length > 60) { error = "Der Name der Kategorie darf höchstens 60 Zeichen lang sein."; return false; }
        return true;
    }

    [HttpGet]
    public async Task<ActionResult<List<ProjectCategoryDto>>> GetAll(string projectId)
    {
        if (!await _db.Projects.AnyAsync(p => p.Id == projectId)) return NotFound();
        var categories = await ProjectCategoryService.EnsureDefaultsAsync(_db, projectId);
        return Ok(categories.Select(ToDto).ToList());
    }

    [HttpPost]
    [Authorize(Roles = ManageRoles)]
    public async Task<ActionResult<ProjectCategoryDto>> Create(string projectId, CreateCategoryRequest request)
    {
        if (!await _db.Projects.AnyAsync(p => p.Id == projectId)) return NotFound();
        if (!ValidName(request.Name, out var name, out var error)) return BadRequest(error);
        if (!ProjectCategory.Palette.Contains(request.Color))
        {
            return BadRequest($"Die Farbe '{request.Color}' ist nicht erlaubt (erlaubt: {string.Join(", ", ProjectCategory.Palette)}).");
        }

        var categories = await ProjectCategoryService.EnsureDefaultsAsync(_db, projectId);
        if (categories.Any(c => string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase)))
        {
            return Conflict($"Die Kategorie '{name}' gibt es in diesem Projekt schon.");
        }

        var created = new ProjectCategory
        {
            ProjectId = projectId,
            Name = name,
            Color = request.Color,
            Order = categories.Max(c => c.Order) + 1,
        };
        _db.ProjectCategories.Add(created);
        await _db.SaveChangesAsync();
        return Ok(ToDto(created));
    }

    [HttpPut("{categoryId:guid}")]
    [Authorize(Roles = ManageRoles)]
    public async Task<ActionResult<ProjectCategoryDto>> Update(string projectId, Guid categoryId, UpdateCategoryRequest request)
    {
        await ProjectCategoryService.EnsureDefaultsAsync(_db, projectId);
        var category = await _db.ProjectCategories.FirstOrDefaultAsync(c => c.Id == categoryId && c.ProjectId == projectId);
        if (category is null) return NotFound();

        var renaming = request.Name is not null && request.Name.Trim() != category.Name;
        var recoloring = request.Color is not null && request.Color != category.Color;
        if (category.IsDefault && (renaming || recoloring))
        {
            return BadRequest($"Die Standard-Kategorie '{category.Name}' lässt sich nur ein- oder ausblenden, nicht umbenennen oder umfärben.");
        }

        if (renaming)
        {
            if (!ValidName(request.Name, out var newName, out var error)) return BadRequest(error);
            var taken = await _db.ProjectCategories.AnyAsync(c =>
                c.ProjectId == projectId && c.Id != categoryId && c.Name.ToLower() == newName.ToLower());
            if (taken) return Conflict($"Die Kategorie '{newName}' gibt es in diesem Projekt schon.");

            // WorkItem.Category stores the name, so the items follow the rename.
            var oldName = category.Name;
            var items = await _db.WorkItems.Where(w => w.ProjectId == projectId && w.Category == oldName).ToListAsync();
            foreach (var item in items) item.Category = newName;
            category.Name = newName;
        }

        if (recoloring)
        {
            if (!ProjectCategory.Palette.Contains(request.Color!))
            {
                return BadRequest($"Die Farbe '{request.Color}' ist nicht erlaubt (erlaubt: {string.Join(", ", ProjectCategory.Palette)}).");
            }
            category.Color = request.Color!;
        }

        if (request.IsHidden is not null) category.IsHidden = request.IsHidden.Value;

        await _db.SaveChangesAsync();
        return Ok(ToDto(category));
    }

    [HttpDelete("{categoryId:guid}")]
    [Authorize(Roles = ManageRoles)]
    public async Task<IActionResult> Delete(string projectId, Guid categoryId)
    {
        var category = await _db.ProjectCategories.FirstOrDefaultAsync(c => c.Id == categoryId && c.ProjectId == projectId);
        if (category is null) return NotFound();

        if (category.IsDefault)
        {
            return BadRequest($"Die Standard-Kategorie '{category.Name}' lässt sich nicht löschen, nur ausblenden.");
        }

        var inUse = await _db.WorkItems.CountAsync(w => w.ProjectId == projectId && w.Category == category.Name);
        if (inUse > 0)
        {
            return Conflict($"'{category.Name}' wird von {inUse} Aufgabe(n) verwendet und lässt sich deshalb nicht löschen. " +
                "Ändere zuerst deren Typ - oder blende die Kategorie nur aus.");
        }

        _db.ProjectCategories.Remove(category);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
