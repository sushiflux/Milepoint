using Milepoint.Api.Data;

namespace Milepoint.Api.Models;

// Independent of ProjectMember (which governs visibility/access) - a user can favorite any
// project they can already see, including one they own without an explicit membership row.
public class ProjectFavorite
{
    public string ProjectId { get; set; } = string.Empty;
    public Project Project { get; set; } = null!;

    public string UserId { get; set; } = string.Empty;
    public ApplicationUser User { get; set; } = null!;
}
