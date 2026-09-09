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
    NoteEdgeArrow? EdgeArrow = null);

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
    NoteEdgeArrow? EdgeArrow = null);

public record NoteLinkRefDto(string Id, string Title);

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
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
