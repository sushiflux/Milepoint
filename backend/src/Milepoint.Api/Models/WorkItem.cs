using Milepoint.Api.Data;

namespace Milepoint.Api.Models;

public class WorkItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Guid BoardId { get; set; }

    public Guid ColumnId { get; set; }
    public BoardColumn Column { get; set; } = null!;

    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public WorkItemType Type { get; set; } = WorkItemType.Task;
    public WorkItemPriority Priority { get; set; } = WorkItemPriority.Medium;
    public int Position { get; set; }

    public string? AssigneeId { get; set; }
    public ApplicationUser? Assignee { get; set; }

    public DateTimeOffset? DueDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Label> Labels { get; set; } = new List<Label>();
}
