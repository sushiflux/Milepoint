namespace Milepoint.Api.Models;

public enum WorkItemType
{
    Task,
    Phase
}

public enum WorkItemPriority
{
    Low,
    Medium,
    High,
    Urgent
}

// Orthogonal to WorkItemType: Type is structural (Task vs. Phase-grouping), Category is what
// kind of work a Task represents. Nullable on WorkItem - not every task needs one.
public enum WorkItemCategory
{
    Feature,
    Bug,
    Chore
}

public enum MilestoneDependencyDirection
{
    // The work item must reach a Done column before the milestone counts as reached.
    WorkItemBlocksMilestone,
    // The work item may not leave its Todo column until the milestone's date has passed.
    MilestoneBlocksWorkItem
}
