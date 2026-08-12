namespace PM.Api.Dtos.Projects;

public record CreateProjectRequest(string Key, string Name, string? Description);

public record ProjectDto(Guid Id, string Key, string Name, string? Description, DateTimeOffset CreatedAt);
