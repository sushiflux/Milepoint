using Microsoft.AspNetCore.Identity;

namespace Milepoint.Api.Data;

public class ApplicationUser : IdentityUser
{
    public string DisplayName { get; set; } = string.Empty;
}
