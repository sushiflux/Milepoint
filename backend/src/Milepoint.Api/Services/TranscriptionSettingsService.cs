using Microsoft.AspNetCore.DataProtection;

namespace Milepoint.Api.Services;

// Thin wrapper around ASP.NET Core Data Protection for TranscriptionSettings' two API-key fields
// (OpenAiApiKeyEncrypted / GoogleApiKeyEncrypted). Not a general-purpose crypto helper - the fixed
// purpose string below scopes the protector so a key created for this purpose can never decrypt
// (or be confused with) ciphertext protected under a different purpose elsewhere in the app.
//
// Registered as a singleton in Program.cs: IDataProtectionProvider itself is a singleton service
// (its key ring is loaded/cached once), and CreateProtector is cheap/idempotent to call repeatedly,
// so resolving one protector instance once at startup and reusing it is both correct and avoids
// re-deriving the same protector on every request.
public class TranscriptionSettingsService
{
    private const string Purpose = "TranscriptionSettings.ApiKeys";

    private readonly IDataProtector _protector;

    public TranscriptionSettingsService(IDataProtectionProvider dataProtectionProvider)
    {
        _protector = dataProtectionProvider.CreateProtector(Purpose);
    }

    // Encrypts a plaintext API key for storage in TranscriptionSettings.OpenAiApiKeyEncrypted /
    // GoogleApiKeyEncrypted. Callers are expected to pass a non-null value - use null/empty
    // handling at the call site (see the request DTO's tri-state doc comment) to decide whether to
    // call this at all, clear the stored value, or leave it untouched.
    public string Encrypt(string plaintext) => _protector.Protect(plaintext);

    // Decrypts a stored value back to plaintext, e.g. right before calling out to the OpenAI/Google
    // API. Null-safe (passes null through as null) since both encrypted-key columns are nullable -
    // "no key configured" is a legitimate state, not an error.
    public string? Decrypt(string? encrypted) => encrypted is null ? null : _protector.Unprotect(encrypted);
}
