using Milepoint.Api.Models;

namespace Milepoint.Api.Dtos.WorkItems;

public record CreateWorkItemRequest(
    Guid ColumnId,
    string Title,
    string? Description,
    WorkItemType Type,
    WorkItemPriority Priority);

public record UpdateWorkItemRequest(
    string Title,
    string? Description,
    WorkItemType Type,
    WorkItemPriority Priority,
    string? AssigneeId,
    DateTimeOffset? DueDate);

public record MoveWorkItemRequest(Guid TargetColumnId, int Position);

public record WorkItemDto(
    string Id,
    Guid ColumnId,
    string Title,
    string? Description,
    WorkItemType Type,
    WorkItemPriority Priority,
    int Position,
    string? AssigneeId,
    string? AssigneeDisplayName,
    DateTimeOffset? DueDate,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    List<Guid> LabelIds);
