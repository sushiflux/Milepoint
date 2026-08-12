namespace PM.Api.Models;

public class Label
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public string ColorHex { get; set; } = "#64748b";

    public ICollection<WorkItem> WorkItems { get; set; } = new List<WorkItem>();
}
