namespace Milepoint.Api.Dtos.Auth;

public record RegisterRequest(string Username, string Email, string Password, string DisplayName);

public record LoginRequest(string Username, string Password);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record AuthResponse(
    string Token,
    DateTimeOffset ExpiresAt,
    string Username,
    string Email,
    string DisplayName,
    IReadOnlyList<string> Roles);
