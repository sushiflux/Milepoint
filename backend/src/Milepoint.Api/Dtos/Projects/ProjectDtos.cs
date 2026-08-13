namespace Milepoint.Api.Dtos.Projects;

public record CreateProjectRequest(string Name, string? Description);

public record ProjectDto(string Id, string Name, string? Description, DateTimeOffset CreatedAt);
