namespace Milepoint.Api.Dtos.ApiTokens;

public record CreateApiTokenRequest(string Name, int? ExpiresInDays);

public record ApiTokenDto(
    Guid Id,
    string Name,
    string TokenPrefix,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ExpiresAt,
    DateTimeOffset? LastUsedAt);

public record CreatedApiTokenResponse(ApiTokenDto Token, string PlainTextToken);
