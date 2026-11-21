using System.Security.Cryptography;
using System.Text;

namespace Milepoint.Api.Services;

/// <summary>
/// Generates and hashes personal access tokens prefixed with "mp_".
/// </summary>
public static class ApiTokenService
{
    public const string TokenPrefix = "mp_";

    public static (string PlainText, string DisplayPrefix, string Hash) Generate()
    {
        var randomBytes = RandomNumberGenerator.GetBytes(32);
        var encoded = Convert.ToBase64String(randomBytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

        var plainText = TokenPrefix + encoded;
        var displayPrefix = plainText[..Math.Min(plainText.Length, 11)];
        var hash = Hash(plainText);
        return (plainText, displayPrefix, hash);
    }

    public static string Hash(string plainTextToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(plainTextToken));
        return Convert.ToHexStringLower(bytes);
    }
}
