namespace Milepoint.Api.Models;

public class BoardColumn
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string BoardId { get; set; } = string.Empty;
    public Board Board { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public int Order { get; set; }
    public int? WipLimit { get; set; }
    public BoardColumnType Type { get; set; } = BoardColumnType.Todo;

    // The four built-in columns (Neu, In Arbeit, Fertig, Pausiert) can only be hidden/shown, never
    // renamed, retyped or deleted; custom columns (IsDefault = false) can be all of that. A hidden
    // column is simply not shown on the board and not offered as a target - it must be empty when
    // it gets hidden (see BoardColumnsController).
    public bool IsDefault { get; set; }
    public bool IsHidden { get; set; }

    public ICollection<WorkItem> WorkItems { get; set; } = new List<WorkItem>();
}
