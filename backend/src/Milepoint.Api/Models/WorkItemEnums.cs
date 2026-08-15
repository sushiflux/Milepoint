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

public enum MilestoneDependencyDirection
{
    // The work item must reach a Done column before the milestone counts as reached.
    WorkItemBlocksMilestone,
    // The work item may not leave its Todo column until the milestone's date has passed.
    MilestoneBlocksWorkItem
}
