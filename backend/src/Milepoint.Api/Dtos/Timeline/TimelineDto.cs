using Milepoint.Api.Dtos.Milestones;
using Milepoint.Api.Dtos.WorkItems;

namespace Milepoint.Api.Dtos.Timeline;

public record TimelineDto(List<WorkItemDto> WorkItems, List<MilestoneDto> Milestones);
