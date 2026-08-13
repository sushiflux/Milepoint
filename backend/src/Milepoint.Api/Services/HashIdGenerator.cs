using System.Security.Cryptography;
using System.Text;

namespace Milepoint.Api.Services;

// Produces git-style 40-char lowercase hex SHA-1 identifiers for entities that need a
// human-referenceable public ID (shown truncated in the UI like a short commit SHA).
public static class HashIdGenerator
{
    public static string Generate()
    {
        var input = $"{Guid.NewGuid()}{DateTimeOffset.UtcNow.Ticks}{Random.Shared.NextInt64()}";
        var bytes = SHA1.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
