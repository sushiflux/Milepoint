using Milepoint.Api.Services;

namespace Milepoint.Api.Models;

// A pure point-in-time marker on the project Timeline (e.g. "Beta-Release" on a fixed date) -
// deliberately not a WorkItem, so it never shows up on the Kanban board.
public class Milestone
{
    public string Id { get; set; } = HashIdGenerator.Generate();
    public string ProjectId { get; set; } = string.Empty;
    public Project Project { get; set; } = null!;

    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTimeOffset Date { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    // Optional grouping into a Phase/Task's subtree on the Timeline (purely visual nesting - not
    // the same as MilestoneDependency, which is about blocking, not layout). Null = top-level.
    public string? ParentWorkItemId { get; set; }
    public WorkItem? ParentWorkItem { get; set; }

    // Both directions of milestone linkage live in one collection - filter by Direction.
    public ICollection<MilestoneDependency> WorkItemLinks { get; set; } = new List<MilestoneDependency>();
}
