using Milepoint.Api.Models;

namespace Milepoint.Api.Dtos.Milestones;

public record CreateMilestoneRequest(string Name, string? Description, DateTimeOffset Date, string? ParentWorkItemId);

public record AddMilestoneDependencyRequest(string WorkItemId, MilestoneDependencyDirection Direction);

public record MilestoneDto(
    string Id,
    string Name,
    string? Description,
    DateTimeOffset Date,
    DateTimeOffset CreatedAt,
    // Visual nesting under a Phase/Task's subtree on the Timeline - null means top-level.
    string? ParentWorkItemId,
    // Work items that must reach a Done column before this milestone counts as reached.
    List<string> BlockedByWorkItemIds,
    // Work items that may not leave their Todo column until this milestone's date has passed.
    List<string> BlockingWorkItemIds);
