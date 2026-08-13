using Milepoint.Api.Data;

namespace Milepoint.Api.Models;

// Explicit project membership, independent of task assignment - see Project visibility rules in
// ProjectsController (creator OR member OR has an assigned WorkItem in the project).
public class ProjectMember
{
    public string ProjectId { get; set; } = string.Empty;
    public Project Project { get; set; } = null!;

    public string UserId { get; set; } = string.Empty;
    public ApplicationUser User { get; set; } = null!;
}
