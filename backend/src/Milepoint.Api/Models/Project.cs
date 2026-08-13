using Milepoint.Api.Data;
using Milepoint.Api.Services;

namespace Milepoint.Api.Models;

public class Project
{
    public string Id { get; set; } = HashIdGenerator.Generate();
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public string CreatedByUserId { get; set; } = string.Empty;
    public ApplicationUser CreatedByUser { get; set; } = null!;

    public ICollection<Board> Boards { get; set; } = new List<Board>();
    public ICollection<Label> Labels { get; set; } = new List<Label>();
    public ICollection<ProjectMember> Members { get; set; } = new List<ProjectMember>();
}
