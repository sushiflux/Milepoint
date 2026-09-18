namespace Milepoint.Api.Dtos.Notes;

public record CreateNoteRequest(
    string Title,
    string Content,
    string? Color = null);

// Color is always applied as given (null clears back to "use the default") - the frontend's note
// editor always has the current value in hand whenever it saves a note at all, the same way
// Title/Content are always sent.
public record UpdateNoteRequest(
    string Title,
    string Content,
    string? Color = null);

public record NoteLinkRefDto(string Id, string Title);

public record NoteDto(
    string Id,
    string Title,
    string Content,
    List<NoteLinkRefDto> OutgoingLinks,
    List<NoteLinkRefDto> IncomingLinks,
    // Concrete hex color (e.g. "#3b82f6") chosen for this note's node in the graph view, or null
    // to use the view's default. Palettes/"schemes" are a frontend-only concept - the backend
    // only ever stores/returns the resolved color.
    string? Color,
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
// every simulation step) and must stay cheap - no title-uniqueness check, no content touch, no
// outgoing-link re-sync. X/Y are non-nullable here (unlike Note.FreeViewX/Y) because
// this endpoint only ever sets a concrete position; there is no "clear the saved position back to
// null" use case from the frontend's physics view, which always has real coordinates once a node
// exists on screen.
public record UpdateNotePositionRequest(double X, double Y);
