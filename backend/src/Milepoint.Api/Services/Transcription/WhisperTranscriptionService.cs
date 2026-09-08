using System.Net.Http.Headers;
using Milepoint.Api.Data;
using Milepoint.Api.Models;

namespace Milepoint.Api.Services.Transcription;

// Proxies transcription requests to a self-hosted onerahmet/openai-whisper-asr-webservice instance
// (docker-compose.yml service "whisper", only reachable from other containers on the Docker
// network - never exposed to the frontend directly, hence this server-side proxy). The endpoint
// URL is admin-configured per TranscriptionSettings.WhisperEndpointUrl (not a fixed appsettings
// value), so this uses a plain named HttpClient rather than a typed client with a fixed
// BaseAddress - the target host can change at runtime without an app restart.
public class WhisperTranscriptionService : ITranscriptionProvider
{
    public const string HttpClientName = "WhisperTranscription";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly PmDbContextBase _db;
    private readonly ILogger<WhisperTranscriptionService> _logger;

    public WhisperTranscriptionService(IHttpClientFactory httpClientFactory, PmDbContextBase db, ILogger<WhisperTranscriptionService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _db = db;
        _logger = logger;
    }

    public async Task<string> TranscribeAsync(Stream audio, string contentType, string language, CancellationToken ct)
    {
        var settings = await _db.TranscriptionSettings.FindAsync([TranscriptionSettings.SingletonId], ct);
        var endpointUrl = settings?.WhisperEndpointUrl;
        if (string.IsNullOrWhiteSpace(endpointUrl))
        {
            throw new TranscriptionConfigurationException("Für den Whisper-Provider ist keine Endpoint-URL konfiguriert.");
        }

        // language is stored as a BCP-47-ish tag (e.g. "de-DE") but the ASR webservice's ?language=
        // query param expects a bare ISO-639-1 code (e.g. "de") - trim the region subtag if present.
        var whisperLanguage = language.Split('-', 2)[0];

        var client = _httpClientFactory.CreateClient(HttpClientName);

        using var content = new MultipartFormDataContent();
        using var streamContent = new StreamContent(audio);
        // MediaTypeHeaderValue's constructor only accepts a bare MIME type ("audio/webm") and
        // throws FormatException on a full Content-Type string with parameters attached (e.g. the
        // "audio/webm;codecs=opus" browsers commonly report for a MediaRecorder blob) - Parse()
        // handles the full string correctly, including any codec parameter.
        var effectiveContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType;
        streamContent.Headers.ContentType = MediaTypeHeaderValue.Parse(effectiveContentType);
        content.Add(streamContent, "audio_file", "audio");

        var requestUri = $"{endpointUrl.TrimEnd('/')}/asr?task=transcribe&language={Uri.EscapeDataString(whisperLanguage)}&output=json";

        HttpResponseMessage response;
        try
        {
            response = await client.PostAsync(requestUri, content, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogError(ex, "Whisper-Transkription fehlgeschlagen (Endpoint: {EndpointUrl})", endpointUrl);
            throw new TranscriptionUpstreamException("Whisper-Dienst nicht erreichbar.", ex);
        }

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("Whisper-Transkription fehlgeschlagen: {StatusCode} {Body}", response.StatusCode, body);
            throw new TranscriptionUpstreamException("Whisper-Dienst hat die Anfrage abgelehnt.");
        }

        var result = await response.Content.ReadFromJsonAsync<WhisperResponse>(cancellationToken: ct);
        return result?.Text?.Trim() ?? string.Empty;
    }

    private sealed record WhisperResponse(string? Text);
}
