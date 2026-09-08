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
}
