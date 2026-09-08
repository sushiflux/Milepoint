using Milepoint.Api.Models;

namespace Milepoint.Api.Dtos.TranscriptionSettings;

// Returned from GET (admin settings read). Deliberately never carries a raw or encrypted key value
// - only whether one is currently configured, so the admin UI can show "key set" / "no key set"
// and a way to clear it, without ever round-tripping the secret itself to the browser.
public record TranscriptionSettingsResponse(
    TranscriptionProvider Provider,
    string? WhisperEndpointUrl,
    string Language,
    bool HasOpenAiKey,
    bool HasGoogleKey,
    bool AutoSummarize);

// Sent on PUT (admin settings update).
//
// OpenAiApiKey / GoogleApiKey are tri-state, distinguishing "not sent" from "sent as empty" -
// callers (and the controller built on top of this DTO) must handle all three states explicitly:
//   - property is null (omitted in the JSON body, or explicitly null): leave the currently stored
//     encrypted key untouched. This is what a "just changed the Language dropdown" save looks like
//     - the admin never re-enters a key they already set previously.
//   - property is an empty string (""): explicitly clear the stored key (set the encrypted column
//     back to null). This is the "remove key" action, distinct from "didn't touch it".
//   - property is a non-empty string: encrypt it (via TranscriptionSettingsService.Encrypt) and
//     store it, replacing whatever was there before.
// This mirrors how PATCH-style "only update what's provided" semantics are commonly modeled, but
// is spelled out here explicitly because null-vs-empty-string is easy to collapse into a single
// "falsy" case by accident (e.g. a naive `if (!string.IsNullOrEmpty(key))` guard silently makes
// clearing a key impossible) - don't do that at the call site.
//
// AutoSummarize only takes effect for Provider == OpenAI/Google (see TranscriptionSettings.AutoSummarize)
// - stored as sent regardless of the chosen provider so a later provider switch doesn't silently
// lose the admin's preference, but TranscriptionController ignores it for Browser/Whisper.
public record UpdateTranscriptionSettingsRequest(
    TranscriptionProvider Provider,
    string? WhisperEndpointUrl,
    string Language,
    string? OpenAiApiKey,
    string? GoogleApiKey,
    bool AutoSummarize);
