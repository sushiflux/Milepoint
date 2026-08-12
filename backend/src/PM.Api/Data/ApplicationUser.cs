using Microsoft.AspNetCore.Identity;

namespace PM.Api.Data;

public class ApplicationUser : IdentityUser
{
    public string DisplayName { get; set; } = string.Empty;
}
