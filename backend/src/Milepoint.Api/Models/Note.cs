using Milepoint.Api.Services;

namespace Milepoint.Api.Models;

public class Note
{
    public string Id { get; set; } = HashIdGenerator.Generate();
    public string ProjectId { get; set; } = string.Empty;
    public Project Project { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    // Unlimited-depth parent/child hierarchy (see WorkItem.ParentWorkItemId for the same pattern
    // used on Kanban subtasks) - separate from, and parallel to, the free-form [[Title]] cross-links
    // above (OutgoingLinks/IncomingLinks). Null = a root-level note directly under the project.
    public string? ParentNoteId { get; set; }
    public Note? ParentNote { get; set; }
    public ICollection<Note> ChildNotes { get; set; } = new List<Note>();

    public ICollection<NoteLink> OutgoingLinks { get; set; } = new List<NoteLink>();
    public ICollection<NoteLink> IncomingLinks { get; set; } = new List<NoteLink>();

    // Visual customization for the graph/tree views, set per-note (not per-project/global) so
    // individual parents or children can be highlighted differently from their siblings. Both are
    // nullable = "use the view's default" (default color, Rounded shape) - the actual color
    // palette/scheme picker is a frontend-only concept (like a theme): this column only ever holds
    // one concrete resolved hex value the frontend already chose, never a scheme name/token, so the
    // backend never needs to know what schemes exist or how they're applied.
    public string? Color { get; set; }
    public NoteShape? Shape { get; set; }

    // Line styling for every edge drawn FROM this note - both to its own ChildNotes (hierarchy)
    // and along its OutgoingLinks (free cross-links). A per-note setting, not per-connection: there
    // is exactly one styling choice per note, applied uniformly to everything that note points to.
    // Both nullable = "use the view's default" (Solid line, no arrowhead), same reasoning as
    // Color/Shape above.
    public NoteEdgeStyle? EdgeStyle { get; set; }
    public NoteEdgeArrow? EdgeArrow { get; set; }
}
