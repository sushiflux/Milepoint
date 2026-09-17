namespace Milepoint.Api.Models;

// Per-CONNECTION style override, distinct from Note.EdgeStyle/EdgeArrow/EdgeWidth/EdgeColor (which
// apply uniformly to every line a note draws outward). The user asked to be able to click a single
// line in the graph and restyle just that one connection's width/color, in addition to (not
// instead of) the existing "click the source note, style all its outgoing lines" flow. One row per
// styled connection, identified by the (SourceNoteId, TargetNoteId) pair - SourceNoteId is the
// NoteLink's owning note, TargetNoteId is the linked note. A separate table rather than a column
// on Note because a connection isn't owned by exactly one Note the way Color/Shape are - a free
// cross-link involves two notes with no single natural owning row. Rows are pure style data with
// no independent identity of their own (no Id) - the composite key IS the connection they style,
// deleted via ExecuteDelete rather than tracked/loaded when a note itself is deleted (see
// NotesController.Delete).
public class NoteEdgeOverride
{
    // Scoped to a project (not derivable from the two note ids alone without a join) so
    // ownership/access checks can filter on it directly, matching every other project-scoped
    // query in this controller.
    public string ProjectId { get; set; } = string.Empty;
    public Project Project { get; set; } = null!;

    public string SourceNoteId { get; set; } = string.Empty;
    public Note SourceNote { get; set; } = null!;
    public string TargetNoteId { get; set; } = string.Empty;
    public Note TargetNote { get; set; } = null!;

    // Both nullable, but at least one must be non-null for a row to exist at all (see
    // NotesController's upsert endpoint - a request with both null deletes the row instead of
    // storing a no-op override) - "use the source note's own EdgeWidth/EdgeColor" is expressed by
    // the row not existing, not by these being null within an existing row.
    public double? Width { get; set; }
    public string? Color { get; set; }
}
