namespace Milepoint.Api.Auth;

public class JwtOptions
{
    public string Issuer { get; set; } = "milepoint-api";
    public string Audience { get; set; } = "milepoint-client";
    public string SigningKey { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; } = 60;
}
