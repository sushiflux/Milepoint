namespace Milepoint.Api.Dtos.Projects;

public record CreateProjectRequest(Guid ProjectCategoryId, string Name, string? Description);

public record ProjectDto(
    Guid Id,
    string Key,
    string Name,
    string? Description,
    DateTimeOffset CreatedAt,
    Guid ProjectCategoryId,
    string ProjectCategoryName);
