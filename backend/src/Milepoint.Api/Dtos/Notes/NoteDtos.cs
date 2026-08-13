namespace Milepoint.Api.Dtos.Notes;

public record CreateNoteRequest(string Title, string Content);

public record UpdateNoteRequest(string Title, string Content);

public record NoteLinkRefDto(string Id, string Title);

public record NoteDto(
    string Id,
    string Title,
    string Content,
    List<NoteLinkRefDto> OutgoingLinks,
    List<NoteLinkRefDto> IncomingLinks,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
