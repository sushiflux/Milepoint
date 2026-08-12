namespace PM.Api.Models;

public class BoardColumn
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BoardId { get; set; }
    public Board Board { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public int Order { get; set; }
    public int? WipLimit { get; set; }

    public ICollection<WorkItem> WorkItems { get; set; } = new List<WorkItem>();
}
