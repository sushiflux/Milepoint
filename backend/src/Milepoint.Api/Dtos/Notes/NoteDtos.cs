using Milepoint.Api.Models;

namespace Milepoint.Api.Dtos.Notes;

// Color/Shape/EdgeStyle/EdgeArrow deliberately do NOT get a SetParentNoteId-style tri-state flag:
// unlike the parent hierarchy (a structural relationship the frontend often edits separately from
// title/content, e.g. via drag-and-drop in the tree view without re-sending a full form), the
// frontend's note editor always has the current color, shape, edge style and edge arrow in hand
// whenever it saves a note at all - the same way Title/Content are always sent. A plain "field
// present in the request = the value to use, null = use the default" is enough here; introducing a
// second tri-state flag per field would just add ceremony for a case that doesn't actually arise
// for these fields.
public record CreateNoteRequest(
    string Title,
    string Content,
    string? ParentNoteId = null,
    string? Color = null,
    NoteShape? Shape = null,
    NoteEdgeStyle? EdgeStyle = null,
    NoteEdgeArrow? EdgeArrow = null,
    double? EdgeWidth = null,
    string? EdgeColor = null);

// ParentNoteId alone can't distinguish "leave the parent assignment unchanged" from "clear it" -
// both cases deserialize to the same null when the field is omitted from the JSON body, since
// null is also the field's own valid value (a note with no parent). SetParentNoteId makes that
// intent explicit: false = ignore ParentNoteId entirely (title/content-only edits, the common
// case, never touch the hierarchy); true = apply ParentNoteId as given (including null, to
// explicitly clear it back to a root note). Without this, a caller that simply forgets to pass
// ParentNoteId on a routine title/content save would silently detach the note from its parent -
// exactly the trap the frontend originally had to work around by re-sending the current value on
// every save; this makes that workaround unnecessary and removes the footgun for future callers.
//
// Color/Shape/EdgeStyle/EdgeArrow don't need the same treatment (see CreateNoteRequest's comment)
// - every update simply applies them as given, null clearing back to "use the default", the same
// way Title/Content are always applied as given.
public record UpdateNoteRequest(
    string Title,
    string Content,
    string? ParentNoteId = null,
    bool SetParentNoteId = false,
    string? Color = null,
    NoteShape? Shape = null,
    NoteEdgeStyle? EdgeStyle = null,
    NoteEdgeArrow? EdgeArrow = null,
    double? EdgeWidth = null,
    string? EdgeColor = null);

public record NoteLinkRefDto(string Id, string Title);

// One connection's style override - see NoteEdgeOverride's doc comment for why this is a separate
// concept from Note.EdgeWidth/EdgeColor. TargetNoteId identifies which of the source note's
// outgoing connections this describes; the source note itself is the {noteId} route parameter on
// the endpoint this is returned from/sent to, not repeated in the body.
public record NoteEdgeOverrideDto(string TargetNoteId, double? Width, string? Color);

// Width/Color both null deletes the override row entirely (falls back to the source note's own
// EdgeWidth/EdgeColor) rather than storing a row that overrides nothing - see
// NotesController.UpsertEdgeOverride.
public record UpdateNoteEdgeOverrideRequest(double? Width, string? Color);

public record NoteDto(
    string Id,
    string Title,
    string Content,
    // Parent/child hierarchy (separate from the OutgoingLinks/IncomingLinks free cross-links
    // below). ChildNoteIds lets the frontend build the tree from one GetAll call without N+1
    // per-note lookups - same reasoning as WorkItemDto exposing ParentWorkItemId, except Notes
    // also hands back the reverse direction since there is no separate "get children" endpoint.
    string? ParentNoteId,
    List<string> ChildNoteIds,
    List<NoteLinkRefDto> OutgoingLinks,
    List<NoteLinkRefDto> IncomingLinks,
    // Concrete hex color (e.g. "#3b82f6") chosen for this note's node in the graph/tree views, or
    // null to use the view's default. Palettes/"schemes" are a frontend-only concept - the backend
    // only ever stores/returns the resolved color.
    string? Color,
    NoteShape? Shape,
    // Line style/arrowhead applied to every edge drawn FROM this note (both to ChildNotes and
    // along OutgoingLinks) in the graph/tree views. Null = use the view's default (Solid, no
    // arrowhead) - see Note.EdgeStyle/EdgeArrow's doc comments.
    NoteEdgeStyle? EdgeStyle,
    NoteEdgeArrow? EdgeArrow,
    // Stroke width/color for every edge drawn FROM this note - null = use the view's default
    // (1px, the normal/highlighted gray-or-brand-accent color) - see Note.EdgeWidth/EdgeColor's
    // doc comments. A specific connection's own NoteEdgeOverride (see EdgeOverrides below) takes
    // priority over these for that one connection only.
    double? EdgeWidth,
    string? EdgeColor,
    // Per-connection overrides for this note's own outgoing connections (both ChildNotes edges and
    // OutgoingLinks) - see NoteEdgeOverride's doc comment. Empty when no connection from this note
    // has been individually restyled.
    List<NoteEdgeOverrideDto> EdgeOverrides,
    // Persisted position in the free (physics-simulated) graph view - see Note.FreeViewX/Y's doc
    // comment. Both null = no saved position yet, frontend should pick its usual randomized/
    // simulated starting position. Not touched by Create/Update above - see
    // UpdateNotePositionRequest/NotesController's dedicated position endpoint.
    double? FreeViewX,
    double? FreeViewY,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

// Dedicated, minimal request for the free-graph-view position sync endpoint
// (PUT /api/projects/{projectId}/notes/{noteId}/position). Deliberately separate from
// UpdateNoteRequest: this gets called very frequently and automatically (every drag, potentially
// every simulation step) and must stay cheap - no title-uniqueness check, no content/hierarchy
// touch, no outgoing-link re-sync. X/Y are non-nullable here (unlike Note.FreeViewX/Y) because
// this endpoint only ever sets a concrete position; there is no "clear the saved position back to
// null" use case from the frontend's physics view, which always has real coordinates once a node
// exists on screen.
public record UpdateNotePositionRequest(double X, double Y);
