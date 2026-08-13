namespace Milepoint.Api.Models;

public class NoteLink
{
    public string SourceNoteId { get; set; } = string.Empty;
    public Note SourceNote { get; set; } = null!;
    public string TargetNoteId { get; set; } = string.Empty;
    public Note TargetNote { get; set; } = null!;
}
