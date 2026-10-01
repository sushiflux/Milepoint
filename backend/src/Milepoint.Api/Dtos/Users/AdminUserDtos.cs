namespace Milepoint.Api.Dtos.Users;

// Role is one of "Admin" / "Projektleiter" / "User" - the highest rank the account holds (Admin
// accounts also carry the Projektleiter role underneath, see AdminUsersController.RolesFor).
public record AdminUserDto(
    string Id,
    string Username,
    string DisplayName,
    string? Email,
    string Role,
    bool IsSelf,
    bool CanModify,
    int OwnedProjects);

public record CreateAdminUserRequest(
    string Username,
    string? DisplayName,
    string? Email,
    string Password,
    string Role);

public record UpdateUserRoleRequest(string Role);

public record ResetUserPasswordRequest(string Password);
