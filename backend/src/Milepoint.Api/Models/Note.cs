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

    public ICollection<NoteLink> OutgoingLinks { get; set; } = new List<NoteLink>();
    public ICollection<NoteLink> IncomingLinks { get; set; } = new List<NoteLink>();

    // Visual customization for the free graph view, set per-note (not per-project/global) so
    // individual notes can be highlighted differently from their neighbors. Nullable = "use the
    // view's default neutral color" - the actual color palette/scheme picker is a frontend-only
    // concept (like a theme): this column only ever holds one concrete resolved hex value the
    // frontend already chose, never a scheme name/token, so the backend never needs to know what
    // schemes exist or how they're applied.
    public string? Color { get; set; }

    // Persisted node position for the free (physics-simulated) graph view (NoteGraphView.tsx on
    // the frontend). Both null = "no saved position yet", telling the frontend to
    // fall back to its usual randomized/simulated starting position (unchanged first-run
    // behavior for brand-new notes). Updated very frequently and automatically (on every drag,
    // and potentially after each simulation step) - deliberately NOT part of
    // CreateNoteRequest/UpdateNoteRequest, which also carry Title/Content and run a title-
    // uniqueness check; see NotesController's dedicated position endpoint instead, which touches
    // only these two columns.
    public double? FreeViewX { get; set; }
    public double? FreeViewY { get; set; }
}
