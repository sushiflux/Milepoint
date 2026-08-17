namespace Milepoint.Api.Dtos.Projects;

public record CreateProjectRequest(string Name, string? Description);

public record UpdateProjectRequest(string Name);

public record AddProjectMemberRequest(string Username);

public record ProjectMemberSummaryDto(string Id, string DisplayName);

public record ColumnTicketCountDto(string ColumnName, int Count);

public record ProjectDto(
    string Id,
    string Name,
    string? Description,
    DateTimeOffset CreatedAt,
    bool IsOwner,
    bool IsFavorite,
    // Project-wide completion if you're the owner, otherwise your own task completion - see
    // ProjectsController for the exact rule.
    double CompletionPercent,
    // Open (non-Done) Task counts per board column, in column order - same breakdown as the
    // Kanban board itself (e.g. Neu / In Arbeit / Pausiert), not just a single total.
    List<ColumnTicketCountDto> OpenTicketsByColumn,
    // Same breakdown, but only counting Tasks assigned to the current user.
    List<ColumnTicketCountDto> MyTicketsByColumn,
    // Open Tasks with a DueDate in the past - project-wide, and just the current user's.
    int OverdueCount,
    int MyOverdueCount,
    // Newest WorkItem.UpdatedAt in the project, or CreatedAt if it has no work items yet.
    DateTimeOffset LastActivityAt,
    string? NextMilestoneName,
    DateTimeOffset? NextMilestoneDate,
    List<ProjectMemberSummaryDto> Members);
