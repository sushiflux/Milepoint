namespace Milepoint.Api.Models;

// Finish-to-start dependency: DependentWorkItem may not leave a Todo-type column until
// BlockingWorkItem sits in a Done-type column - enforced in WorkItemsController.Move.
public class WorkItemDependency
{
    public string DependentWorkItemId { get; set; } = string.Empty;
    public WorkItem DependentWorkItem { get; set; } = null!;

    public string BlockingWorkItemId { get; set; } = string.Empty;
    public WorkItem BlockingWorkItem { get; set; } = null!;
}
