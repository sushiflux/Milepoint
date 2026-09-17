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
    // individual notes can be highlighted differently from their neighbors. Both are nullable =
    // "use the view's default" (default color, Rounded shape) - the actual color palette/scheme
    // picker is a frontend-only concept (like a theme): this column only ever holds one concrete
    // resolved hex value the frontend already chose, never a scheme name/token, so the backend
    // never needs to know what schemes exist or how they're applied.
    public string? Color { get; set; }
    public NoteShape? Shape { get; set; }

    // Line styling for every edge drawn FROM this note along its OutgoingLinks (free cross-links).
    // A per-note setting, not per-connection: there is exactly one styling choice per note, applied
    // uniformly to everything that note points to - UNLESS a specific connection has its own
    // NoteEdgeOverride (see that class's doc comment), which wins over these note-wide defaults for
    // that one connection only. All nullable = "use the view's default" (Solid line, no arrowhead,
    // default gray, 1px), same reasoning as Color/Shape above.
    public NoteEdgeStyle? EdgeStyle { get; set; }
    public NoteEdgeArrow? EdgeArrow { get; set; }
    // Stroke width in px for every edge drawn from this note - a plain positive double (not an
    // enum like EdgeStyle/EdgeArrow, since there's no fixed set of valid widths to validate
    // against, just a sensible clamped range enforced at the API boundary - see
    // UpdateNoteRequest's doc comment).
    public double? EdgeWidth { get; set; }
    // Stroke color (hex, same validation as Note.Color) for every edge drawn from this note -
    // deliberately separate from Note.Color (the node's own fill/text color) since the user asked
    // for the line color to be independently choosable from the node it originates at, not tied
    // to it.
    public string? EdgeColor { get; set; }

    // Per-connection style overrides for this note's own outgoing connections - see
    // NoteEdgeOverride's doc comment. Only the "this note as source" direction is exposed here;
    // there's no corresponding IncomingEdgeOverrides, since an override is only ever relevant to
    // the note whose outgoing connections it's styling (the same asymmetry OutgoingLinks/
    // IncomingLinks above already has for a different reason).
    public ICollection<NoteEdgeOverride> OutgoingEdgeOverrides { get; set; } = new List<NoteEdgeOverride>();

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
