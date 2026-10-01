using Microsoft.EntityFrameworkCore;
using Milepoint.Api.Data;
using Milepoint.Api.Models;

namespace Milepoint.Api.Services;

// Per-project work-item categories (see ProjectCategory). Projects created before this feature have
// no rows at all, so the three built-in ones are created lazily the first time they are needed.
public static class ProjectCategoryService
{
    public static async Task<List<ProjectCategory>> EnsureDefaultsAsync(PmDbContextBase db, string projectId)
    {
        var categories = await db.ProjectCategories.Where(c => c.ProjectId == projectId).ToListAsync();

        var added = false;
        for (var i = 0; i < ProjectCategory.Defaults.Length; i++)
        {
            var (name, color) = ProjectCategory.Defaults[i];
            if (categories.Any(c => c.IsDefault && c.Name == name)) continue;

            var created = new ProjectCategory { ProjectId = projectId, Name = name, Color = color, IsDefault = true, Order = i };
            db.ProjectCategories.Add(created);
            categories.Add(created);
            added = true;
        }

        if (added) await db.SaveChangesAsync();
        return categories.OrderBy(c => c.Order).ThenBy(c => c.Name).ToList();
    }

    // Validates the category a work item is created with / changed to. The stored name is the
    // canonical spelling of the project's category. An item may KEEP a category that has since been
    // hidden (currentValue), but a hidden category can't be newly assigned.
    public static async Task<(string? Name, string? Error)> ResolveAsync(
        PmDbContextBase db, string projectId, string? requested, string? currentValue)
    {
        if (string.IsNullOrWhiteSpace(requested)) return (null, null);

        var wanted = requested.Trim();
        var categories = await EnsureDefaultsAsync(db, projectId);
        var match = categories.FirstOrDefault(c => string.Equals(c.Name, wanted, StringComparison.OrdinalIgnoreCase));
        if (match is null)
        {
            return (null, $"Die Kategorie '{wanted}' gibt es in diesem Projekt nicht.");
        }

        if (match.IsHidden && !string.Equals(match.Name, currentValue, StringComparison.OrdinalIgnoreCase))
        {
            return (null, $"Die Kategorie '{match.Name}' ist in diesem Projekt ausgeblendet.");
        }

        return (match.Name, null);
    }
}
