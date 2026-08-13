using Milepoint.Api.Dtos.WorkItems;
using Milepoint.Api.Models;

namespace Milepoint.Api.Services;

// Shared by WorkItemsController and TimelineController. Callers must have loaded Assignee, Labels,
// Column, and Dependencies (see the .Include calls in each controller).
public static class WorkItemMapper
{
    public static WorkItemDto ToDto(WorkItem item) => new(
        item.Id,
        WorkItemReferenceCode.Format(item.ReferencePrefix, item.ReferenceNumber),
        item.BoardId,
        item.ColumnId,
        item.Column.Name,
        item.Column.Type,
        item.ParentWorkItemId,
        item.Title,
        item.Description,
        item.Type,
        item.Priority,
        item.Position,
        item.AssigneeId,
        item.Assignee?.DisplayName,
        item.StartDate,
        item.DueDate,
        item.CreatedAt,
        item.UpdatedAt,
        item.Labels.Select(l => l.Id).ToList(),
        item.Dependencies.Select(d => d.BlockingWorkItemId).ToList());
}
