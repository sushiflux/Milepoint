namespace Milepoint.Api.Models;

// Instance-wide (not per-user, not per-project) admin configuration for the speech-to-text
// feature backing the voice-dictation button in Notes/other big textareas.
//
// Singleton design: exactly one row ever exists, at the fixed well-known Id below (not "the
// first/only row found by convention", so a stray second insert is a constraint violation rather
// than an ambiguous "which one is active" question, and callers can upsert by primary key without
// a read-then-decide race). There's no existing app-wide-settings precedent in this codebase to
// follow (UserPreference is per-user, not instance-wide) - this is the first of its kind, so the
// convention set here (fixed Id singleton) is the one to reuse if a second instance-wide settings
// entity shows up later.
//
// API keys are stored ENCRYPTED ONLY (see OpenAiApiKeyEncrypted / GoogleApiKeyEncrypted) via
// TranscriptionSettingsService, which wraps IDataProtectionProvider. The raw key is never
// persisted and never round-trips to the frontend - see Dtos/TranscriptionSettings.
public class TranscriptionSettings
{
    // Fixed singleton row Id - not generated, not auto-increment. Every read/write targets this
    // exact value (Set<TranscriptionSettings>().FindAsync(SingletonId) or equivalent), so there is
    // never a "which row is the real settings" ambiguity even if a bug or manual DB edit tries to
    // insert a second row (the unique PK simply rejects it).
    public const int SingletonId = 1;

    public int Id { get; set; } = SingletonId;

    public TranscriptionProvider Provider { get; set; } = TranscriptionProvider.Browser;

    // Only relevant when Provider == Whisper, e.g. "http://whisper:9000". Not a secret - stored
    // in plain text like any other endpoint/connection config.
    public string? WhisperEndpointUrl { get; set; }

    // Encrypted via TranscriptionSettingsService.Encrypt (ASP.NET Core Data Protection,
    // purpose "TranscriptionSettings.ApiKeys"). Only relevant when Provider == OpenAI. Never
    // exposed to the frontend - TranscriptionSettingsResponse only ever surfaces HasOpenAiKey.
    public string? OpenAiApiKeyEncrypted { get; set; }

    // Same as OpenAiApiKeyEncrypted, for Provider == Google.
    public string? GoogleApiKeyEncrypted { get; set; }

    // BCP-47-ish tag (e.g. "de-DE"), applied across whichever provider is active where that
    // provider accepts a language hint.
    public string Language { get; set; } = "de-DE";

    // Only meaningful when Provider == OpenAI or Provider == Google - those two providers have an
    // LLM available behind the same API/key that can turn a raw transcript into a compact summary
    // in a second call. Whisper/Browser only ever produce a raw transcript (no LLM capability
    // behind either), so this flag is a no-op for those providers regardless of its stored value -
    // TranscriptionController checks Provider before honoring it, it doesn't rely on the admin UI
    // alone to keep it consistent.
    public bool AutoSummarize { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
