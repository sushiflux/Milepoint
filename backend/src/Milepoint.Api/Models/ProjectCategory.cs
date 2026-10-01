namespace Milepoint.Api.Models;

// A work-item category ("Typ") of ONE project. The three built-in ones (Feature, Bug, Chore) exist
// per project as IsDefault rows - they can only be hidden/shown, never renamed or deleted; every
// other row is a custom category a Projektleiter/Admin added. WorkItem.Category stores the NAME of
// the category (see ProjectCategoriesController for the rules). Color is a palette token
// (e.g. "violet"), mapped to concrete, contrast-checked classes in the frontend.
public class ProjectCategory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ProjectId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "slate";
    public bool IsDefault { get; set; }
    public bool IsHidden { get; set; }
    public int Order { get; set; }

    public static readonly (string Name, string Color)[] Defaults =
    [
        ("Feature", "violet"),
        ("Bug", "rose"),
        ("Chore", "slate"),
    ];

    // The palette a custom category may use - keep in sync with CATEGORY_PALETTE in the frontend.
    public static readonly string[] Palette = ["violet", "rose", "slate", "sky", "emerald", "amber", "orange", "teal"];
}
