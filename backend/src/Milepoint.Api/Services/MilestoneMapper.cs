using Milepoint.Api.Dtos.Milestones;
using Milepoint.Api.Models;

namespace Milepoint.Api.Services;

// Shared by MilestonesController and TimelineController. Callers must have loaded WorkItemLinks
// (see the .Include calls in each controller).
public static class MilestoneMapper
{
    public static MilestoneDto ToDto(Milestone m) => new(
        m.Id,
        m.Name,
        m.Description,
        m.Date,
        m.CreatedAt,
        m.ParentWorkItemId,
        m.WorkItemLinks.Where(l => l.Direction == MilestoneDependencyDirection.WorkItemBlocksMilestone).Select(l => l.WorkItemId).ToList(),
        m.WorkItemLinks.Where(l => l.Direction == MilestoneDependencyDirection.MilestoneBlocksWorkItem).Select(l => l.WorkItemId).ToList());
}
