using Milepoint.Api.Services;

namespace Milepoint.Api.Models;

public class Board
{
    public string Id { get; set; } = HashIdGenerator.Generate();
    public string ProjectId { get; set; } = string.Empty;
    public Project Project { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<BoardColumn> Columns { get; set; } = new List<BoardColumn>();
}
