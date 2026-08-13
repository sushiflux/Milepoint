namespace Milepoint.Api.Dtos.Milestones;

public record CreateMilestoneRequest(string Name, string? Description, DateTimeOffset Date);

public record MilestoneDto(string Id, string Name, string? Description, DateTimeOffset Date, DateTimeOffset CreatedAt);
