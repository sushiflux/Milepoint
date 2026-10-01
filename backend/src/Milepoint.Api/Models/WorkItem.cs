using Milepoint.Api.Data;
using Milepoint.Api.Services;

namespace Milepoint.Api.Models;

public class WorkItem
{
    public string Id { get; set; } = HashIdGenerator.Generate();
    public string ProjectId { get; set; } = string.Empty;
    public string BoardId { get; set; } = string.Empty;

    public Guid ColumnId { get; set; }
    public BoardColumn Column { get; set; } = null!;

    // Unlimited-depth subtask tree (see the Timeline view). Null = a top-level task.
    public string? ParentWorkItemId { get; set; }
    public WorkItem? ParentWorkItem { get; set; }
    public ICollection<WorkItem> Children { get; set; } = new List<WorkItem>();

    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public WorkItemType Type { get; set; } = WorkItemType.Task;
    public WorkItemPriority Priority { get; set; } = WorkItemPriority.Medium;
    // Name of a ProjectCategory of this project (null = none). A name, not an id, so the JSON shape
    // stays the plain string it always was ("Feature", "Bug", "Chore", or a custom name).
    public string? Category { get; set; }
    public int Position { get; set; }

    // Assigned once at creation (see WorkItemReferenceCode) and never recomputed, so a ticket's
    // reference number stays stable even if its Type is edited later.
    public string ReferencePrefix { get; set; } = string.Empty;
    public int ReferenceNumber { get; set; }

    public string? AssigneeId { get; set; }
    public ApplicationUser? Assignee { get; set; }

    // Both optional, shown as a bar on the Timeline when set; DueDate alone renders as a single marker.
    public DateTimeOffset? StartDate { get; set; }
    public DateTimeOffset? DueDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<Label> Labels { get; set; } = new List<Label>();

    // Tasks that must reach a Done column before this one may move out of its Todo column.
    public ICollection<WorkItemDependency> Dependencies { get; set; } = new List<WorkItemDependency>();

    // Both directions of milestone linkage live in one collection - filter by Direction.
    public ICollection<MilestoneDependency> MilestoneLinks { get; set; } = new List<MilestoneDependency>();
}
