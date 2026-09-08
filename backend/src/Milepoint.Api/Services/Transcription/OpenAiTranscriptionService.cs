using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using Milepoint.Api.Data;
using Milepoint.Api.Models;

namespace Milepoint.Api.Services.Transcription;

// Calls OpenAI's hosted Whisper transcription endpoint, and optionally (TranscriptionSettings.AutoSummarize)
// a second Chat Completions call to condense the raw transcript. Registered as a typed HttpClient
// (see Program.cs) with a fixed BaseAddress ("https://api.openai.com/") - unlike Whisper, the
// target host never varies per admin config, only the API key does (read per-request from
// TranscriptionSettings, not baked into the HttpClient at DI registration time, since it can
// change at runtime without an app restart).
public class OpenAiTranscriptionService : ITranscriptionProvider
{
    // whisper-1: OpenAI's original, most broadly available transcription model - reliable default.
    // gpt-4o-transcribe would be a higher-accuracy alternative but is pickier about audio formats;
    // whisper-1 accepts the widest range of upload formats (webm/mp3/wav/m4a/...), matching what a
    // browser's MediaRecorder typically produces without extra client-side transcoding.
    private const string TranscriptionModel = "whisper-1";

    // gpt-4o-mini: fast/cheap, more than sufficient for condensing a short dictated note into a
    // summary - no need for a larger model for this use case.
    private const string SummarizationModel = "gpt-4o-mini";

    public const string HttpClientName = "OpenAiTranscription";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly PmDbContextBase _db;
    private readonly TranscriptionSettingsService _settingsService;
    private readonly ILogger<OpenAiTranscriptionService> _logger;

    public OpenAiTranscriptionService(
        IHttpClientFactory httpClientFactory,
        PmDbContextBase db,
        TranscriptionSettingsService settingsService,
        ILogger<OpenAiTranscriptionService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _db = db;
        _settingsService = settingsService;
        _logger = logger;
    }

    public async Task<string> TranscribeAsync(Stream audio, string contentType, string language, CancellationToken ct)
    {
        var settings = await _db.TranscriptionSettings.FindAsync([TranscriptionSettings.SingletonId], ct);
        var apiKey = _settingsService.Decrypt(settings?.OpenAiApiKeyEncrypted);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new TranscriptionConfigurationException("Für den OpenAI-Provider ist kein API-Key konfiguriert.");
        }

        var client = _httpClientFactory.CreateClient(HttpClientName);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        using var content = new MultipartFormDataContent();
        using var streamContent = new StreamContent(audio);
        // MediaTypeHeaderValue's constructor only accepts a bare MIME type and throws
        // FormatException on a full Content-Type string with parameters attached (e.g. the
        // "audio/webm;codecs=opus" browsers commonly report for a MediaRecorder blob) - Parse()
        // handles the full string correctly, including any codec parameter.
        var effectiveContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType;
        streamContent.Headers.ContentType = MediaTypeHeaderValue.Parse(effectiveContentType);
        content.Add(streamContent, "file", "audio" + GuessExtension(contentType));
        content.Add(new StringContent(TranscriptionModel), "model");
        // whisper-1 accepts a bare ISO-639-1 code, same trimming as the Whisper provider.
        content.Add(new StringContent(language.Split('-', 2)[0]), "language");

        HttpResponseMessage response;
        try
        {
            response = await client.PostAsync("v1/audio/transcriptions", content, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogError(ex, "OpenAI-Transkription fehlgeschlagen");
            throw new TranscriptionUpstreamException("OpenAI-Dienst nicht erreichbar.", ex);
        }

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("OpenAI-Transkription fehlgeschlagen: {StatusCode} {Body}", response.StatusCode, RedactApiKey(body, apiKey));
            throw new TranscriptionUpstreamException("OpenAI-Dienst hat die Anfrage abgelehnt.");
        }

        var result = await response.Content.ReadFromJsonAsync<OpenAiTranscriptionResponse>(cancellationToken: ct);
        var transcript = result?.Text?.Trim() ?? string.Empty;

        if (settings?.AutoSummarize == true && !string.IsNullOrWhiteSpace(transcript))
        {
            return await SummarizeAsync(client, transcript, language, ct);
        }

        return transcript;
    }

    private async Task<string> SummarizeAsync(HttpClient client, string transcript, string language, CancellationToken ct)
    {
        var requestBody = new
        {
            model = SummarizationModel,
            messages = new object[]
            {
                new
                {
                    role = "system",
                    content = $"Du fasst diktierte Notizen prägnant in ihrer Ausgangssprache ({language}) zusammen. " +
                              "Gib nur die Zusammenfassung mit den wichtigsten Punkten zurück, keine Einleitung, keine Meta-Kommentare."
                },
                new { role = "user", content = transcript }
            }
        };

        HttpResponseMessage response;
        try
        {
            response = await client.PostAsJsonAsync("v1/chat/completions", requestBody, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            // Summarization is a best-effort enhancement on top of an already-successful
            // transcription - if it fails, fall back to the raw transcript rather than losing the
            // user's dictated text entirely.
            _logger.LogWarning(ex, "OpenAI-Zusammenfassung fehlgeschlagen, gebe Rohtranskript zurück");
            return transcript;
        }

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            _logger.LogWarning("OpenAI-Zusammenfassung fehlgeschlagen: {StatusCode} {Body}", response.StatusCode, body);
            return transcript;
        }

        var result = await response.Content.ReadFromJsonAsync<OpenAiChatResponse>(cancellationToken: ct);
        var summary = result?.Choices?.FirstOrDefault()?.Message?.Content?.Trim();
        return string.IsNullOrWhiteSpace(summary) ? transcript : summary;
    }

    private static string GuessExtension(string contentType) => contentType switch
    {
        "audio/webm" => ".webm",
        "audio/mp4" or "audio/m4a" or "audio/x-m4a" => ".m4a",
        "audio/mpeg" or "audio/mp3" => ".mp3",
        "audio/wav" or "audio/x-wav" or "audio/wave" => ".wav",
        "audio/ogg" => ".ogg",
        _ => ".webm"
    };

    // Defense in depth: the API key should never appear in a provider error body, but if OpenAI
    // ever echoed a request header back for debugging, this keeps it out of application logs too.
    private static string RedactApiKey(string text, string apiKey) =>
        string.IsNullOrEmpty(apiKey) ? text : text.Replace(apiKey, "***redacted***");

    private sealed record OpenAiTranscriptionResponse([property: JsonPropertyName("text")] string? Text);

    private sealed record OpenAiChatResponse([property: JsonPropertyName("choices")] List<OpenAiChatChoice>? Choices);

    private sealed record OpenAiChatChoice([property: JsonPropertyName("message")] OpenAiChatMessage? Message);

    private sealed record OpenAiChatMessage([property: JsonPropertyName("content")] string? Content);
}
