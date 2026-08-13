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
}
