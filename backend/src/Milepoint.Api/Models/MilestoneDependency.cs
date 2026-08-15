namespace Milepoint.Api.Models;

// Links a Milestone and a WorkItem in one of two directions (see MilestoneDependencyDirection).
// One row per (Milestone, WorkItem) pair - a pair can only be linked in one direction at a time.
public class MilestoneDependency
{
    public string MilestoneId { get; set; } = string.Empty;
    public Milestone Milestone { get; set; } = null!;

    public string WorkItemId { get; set; } = string.Empty;
    public WorkItem WorkItem { get; set; } = null!;

    public MilestoneDependencyDirection Direction { get; set; }
}
