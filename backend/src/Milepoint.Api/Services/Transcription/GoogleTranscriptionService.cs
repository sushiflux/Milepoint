using System.Text.Json.Serialization;
using Milepoint.Api.Data;
using Milepoint.Api.Models;

namespace Milepoint.Api.Services.Transcription;

// Uses the Gemini API's inline-audio-input support (generateContent with an audio part) rather
// than the dedicated Cloud Speech-to-Text API. Chosen deliberately for this feature:
//   - Speech-to-Text needs a GCP service-account JSON key + project/billing setup; Gemini needs
//     only a single API key (console.cloud.google.com/apis or aistudio.google.com), matching the
//     "one encrypted key field" shape TranscriptionSettings already has for GoogleApiKeyEncrypted
//     (same shape as OpenAI's single key) - no second credential type to store/encrypt/rotate.
//   - Gemini natively accepts short audio clips inline in a generateContent call and can both
//     transcribe *and* (via a second prompt) summarize using the exact same API/key, which lines up
//     with AutoSummarize applying to OpenAI and Google identically. The dedicated Speech-to-Text API
//     has no summarization capability of its own - a second, different Google product/key would be
//     needed just for that half of the feature.
//   - Short dictation clips (the target use case here - notes fields, not long-form audio) fit
//     comfortably within Gemini's inline-data size limits without needing the Files API.
// gemini-2.0-flash: fast/cheap multimodal model with solid audio-transcription accuracy, a
// reasonable default for short dictated notes. Bump to a newer flash-tier model here if one
// becomes the recommended default later - kept as a single constant for exactly that reason.
public class GoogleTranscriptionService : ITranscriptionProvider
{
    private const string Model = "gemini-2.0-flash";

    public const string HttpClientName = "GoogleTranscription";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly PmDbContextBase _db;
    private readonly TranscriptionSettingsService _settingsService;
    private readonly ILogger<GoogleTranscriptionService> _logger;

    public GoogleTranscriptionService(
        IHttpClientFactory httpClientFactory,
        PmDbContextBase db,
        TranscriptionSettingsService settingsService,
        ILogger<GoogleTranscriptionService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _db = db;
        _settingsService = settingsService;
        _logger = logger;
    }

    public async Task<string> TranscribeAsync(Stream audio, string contentType, string language, CancellationToken ct)
    {
        var settings = await _db.TranscriptionSettings.FindAsync([TranscriptionSettings.SingletonId], ct);
        var apiKey = _settingsService.Decrypt(settings?.GoogleApiKeyEncrypted);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new TranscriptionConfigurationException("Für den Google-Provider ist kein API-Key konfiguriert.");
        }

        using var memoryStream = new MemoryStream();
        await audio.CopyToAsync(memoryStream, ct);
        var audioBase64 = Convert.ToBase64String(memoryStream.ToArray());
        var mimeType = string.IsNullOrWhiteSpace(contentType) ? "audio/webm" : contentType;

        var transcript = await GenerateAsync(
            apiKey,
            $"Transkribiere die folgende Audioaufnahme wortwörtlich in der Sprache {language}. " +
            "Gib ausschließlich den transkribierten Text zurück, ohne Einleitung, ohne Anführungszeichen, ohne Kommentare.",
            audioBase64,
            mimeType,
            ct);

        if (settings?.AutoSummarize == true && !string.IsNullOrWhiteSpace(transcript))
        {
            var summary = await GenerateAsync(
                apiKey,
                $"Fasse den folgenden diktierten Text prägnant in seiner Ausgangssprache ({language}) zusammen, " +
                $"mit den wichtigsten Punkten. Gib nur die Zusammenfassung zurück, keine Einleitung:\n\n{transcript}",
                null,
                null,
                ct,
                fallbackOnFailure: transcript);
            return summary;
        }

        return transcript;
    }

    private async Task<string> GenerateAsync(
        string apiKey,
        string promptText,
        string? audioBase64,
        string? audioMimeType,
        CancellationToken ct,
        string? fallbackOnFailure = null)
    {
        var parts = new List<object> { new { text = promptText } };
        if (audioBase64 is not null && audioMimeType is not null)
        {
            parts.Add(new { inline_data = new { mime_type = audioMimeType, data = audioBase64 } });
        }

        var requestBody = new
        {
            contents = new[] { new { parts } }
        };

        var client = _httpClientFactory.CreateClient(HttpClientName);
        var requestUri = $"v1beta/models/{Model}:generateContent?key={Uri.EscapeDataString(apiKey)}";

        HttpResponseMessage response;
        try
        {
            response = await client.PostAsJsonAsync(requestUri, requestBody, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogError(ex, "Google-Transkription/Zusammenfassung fehlgeschlagen");
            if (fallbackOnFailure is not null)
            {
                return fallbackOnFailure;
            }

            throw new TranscriptionUpstreamException("Google-Dienst nicht erreichbar.", ex);
        }

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("Google-Anfrage fehlgeschlagen: {StatusCode} {Body}", response.StatusCode, RedactApiKey(body, apiKey));
            if (fallbackOnFailure is not null)
            {
                return fallbackOnFailure;
            }

            throw new TranscriptionUpstreamException("Google-Dienst hat die Anfrage abgelehnt.");
        }

        var result = await response.Content.ReadFromJsonAsync<GeminiResponse>(cancellationToken: ct);
        var text = result?.Candidates?.FirstOrDefault()?.Content?.Parts?.FirstOrDefault()?.Text?.Trim();

        if (string.IsNullOrWhiteSpace(text))
        {
            return fallbackOnFailure ?? string.Empty;
        }

        return text;
    }

    // The API key is sent as a query string parameter (Gemini's documented auth scheme) - redact
    // it from anything that lands in application logs, same defense-in-depth as OpenAiTranscriptionService.
    private static string RedactApiKey(string text, string apiKey) =>
        string.IsNullOrEmpty(apiKey) ? text : text.Replace(apiKey, "***redacted***");

    private sealed record GeminiResponse([property: JsonPropertyName("candidates")] List<GeminiCandidate>? Candidates);

    private sealed record GeminiCandidate([property: JsonPropertyName("content")] GeminiContent? Content);

    private sealed record GeminiContent([property: JsonPropertyName("parts")] List<GeminiPart>? Parts);

    private sealed record GeminiPart([property: JsonPropertyName("text")] string? Text);
}
