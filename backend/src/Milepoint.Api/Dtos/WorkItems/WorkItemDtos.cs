using Milepoint.Api.Models;

namespace Milepoint.Api.Dtos.WorkItems;

public record CreateWorkItemRequest(
    Guid ColumnId,
    string Title,
    string? Description,
    WorkItemType Type,
    WorkItemPriority Priority,
    string? ParentWorkItemId,
    DateTimeOffset? StartDate,
    DateTimeOffset? DueDate);

public record UpdateWorkItemRequest(
    string Title,
    string? Description,
    WorkItemType Type,
    WorkItemPriority Priority,
    string? AssigneeId,
    string? ParentWorkItemId,
    DateTimeOffset? StartDate,
    DateTimeOffset? DueDate);

public record MoveWorkItemRequest(Guid TargetColumnId, int Position);

public record AddDependencyRequest(string BlockingWorkItemId);

public record WorkItemDto(
    string Id,
    string ReferenceCode,
    string BoardId,
    Guid ColumnId,
    string ColumnName,
    BoardColumnType ColumnType,
    string? ParentWorkItemId,
    string Title,
    string? Description,
    WorkItemType Type,
    WorkItemPriority Priority,
    int Position,
    string? AssigneeId,
    string? AssigneeDisplayName,
    DateTimeOffset? StartDate,
    DateTimeOffset? DueDate,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    List<Guid> LabelIds,
    List<string> BlockingWorkItemIds,
    // Milestones that must be reached (date passed) before this work item may leave Todo.
    List<string> BlockedByMilestoneIds);
