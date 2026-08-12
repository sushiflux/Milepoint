namespace Milepoint.Api.Dtos.ProjectCategories;

public record ProjectCategoryDto(Guid Id, string Code, string Name, DateTimeOffset CreatedAt);

public record CreateProjectCategoryRequest(string Code, string Name);

public record UpdateProjectCategoryRequest(string Code, string Name);
