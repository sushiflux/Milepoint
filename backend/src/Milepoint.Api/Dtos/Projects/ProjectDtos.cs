namespace Milepoint.Api.Dtos.Projects;

public record CreateProjectRequest(string Name, string? Description);

public record AddProjectMemberRequest(string Username);

public record ProjectDto(
    string Id,
    string Name,
    string? Description,
    DateTimeOffset CreatedAt,
    bool IsOwner,
    int MyAssignedTaskCount,
    int MyCompletedTaskCount,
    // Project-wide completion if you're the owner, otherwise your own task completion - see
    // ProjectsController for the exact rule.
    double CompletionPercent);
