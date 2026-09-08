namespace Milepoint.Api.Dtos.Notes;

public record CreateNoteRequest(string Title, string Content, string? ParentNoteId = null);

// ParentNoteId alone can't distinguish "leave the parent assignment unchanged" from "clear it" -
// both cases deserialize to the same null when the field is omitted from the JSON body, since
// null is also the field's own valid value (a note with no parent). SetParentNoteId makes that
// intent explicit: false = ignore ParentNoteId entirely (title/content-only edits, the common
// case, never touch the hierarchy); true = apply ParentNoteId as given (including null, to
// explicitly clear it back to a root note). Without this, a caller that simply forgets to pass
// ParentNoteId on a routine title/content save would silently detach the note from its parent -
// exactly the trap the frontend originally had to work around by re-sending the current value on
// every save; this makes that workaround unnecessary and removes the footgun for future callers.
public record UpdateNoteRequest(string Title, string Content, string? ParentNoteId = null, bool SetParentNoteId = false);

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
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
