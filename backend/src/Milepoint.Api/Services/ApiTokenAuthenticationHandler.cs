using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Milepoint.Api.Data;
using Milepoint.Api.Models;

namespace Milepoint.Api.Services;

/// <summary>
/// Authenticates requests carrying an "Authorization: Bearer mp_..." personal access token.
/// </summary>
public sealed class ApiTokenAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "ApiToken";

    private readonly PmDbContextBase _db;
    private readonly UserManager<ApplicationUser> _userManager;

    public ApiTokenAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        PmDbContextBase db,
        UserManager<ApplicationUser> userManager)
        : base(options, logger, encoder)
    {
        _db = db;
        _userManager = userManager;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var authHeader = Request.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(authHeader) || !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return AuthenticateResult.NoResult();
        }

        var rawToken = authHeader["Bearer ".Length..].Trim();
        if (!rawToken.StartsWith(ApiTokenService.TokenPrefix, StringComparison.Ordinal))
        {
            return AuthenticateResult.NoResult();
        }

        var tokenHash = ApiTokenService.Hash(rawToken);
        var token = await _db.ApiTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash, Context.RequestAborted);

        if (token is null)
        {
            return AuthenticateResult.Fail("Ungültiges API-Token.");
        }

        var now = DateTimeOffset.UtcNow;
        if (token.ExpiresAt.HasValue && token.ExpiresAt.Value <= now)
        {
            return AuthenticateResult.Fail("API-Token ist abgelaufen.");
        }

        // Throttle LastUsedAt updates to at most once per minute to avoid write amplification on bursts.
        if (!token.LastUsedAt.HasValue || now - token.LastUsedAt.Value > TimeSpan.FromMinutes(1))
        {
            token.LastUsedAt = now;
            await _db.SaveChangesAsync(Context.RequestAborted);
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, token.User.Id),
            new(ClaimTypes.Name, token.User.UserName ?? string.Empty),
            new("auth_method", SchemeName)
        };

        var roles = await _userManager.GetRolesAsync(token.User);
        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        return AuthenticateResult.Success(new AuthenticationTicket(principal, SchemeName));
    }
}
