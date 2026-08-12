namespace PM.Api.Auth;

public class JwtOptions
{
    public string Issuer { get; set; } = "pm-api";
    public string Audience { get; set; } = "pm-client";
    public string SigningKey { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; } = 60;
}
