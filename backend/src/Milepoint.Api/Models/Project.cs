namespace Milepoint.Api.Models;

public class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Board> Boards { get; set; } = new List<Board>();
    public ICollection<Label> Labels { get; set; } = new List<Label>();
}
