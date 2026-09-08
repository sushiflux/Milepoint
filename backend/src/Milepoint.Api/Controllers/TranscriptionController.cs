using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Milepoint.Api.Data;
using Milepoint.Api.Dtos.TranscriptionSettings;
using Milepoint.Api.Models;
using Milepoint.Api.Services;
using Milepoint.Api.Services.Transcription;

namespace Milepoint.Api.Controllers;

// Two concerns live here on purpose, mirroring how PreferencesController owns both the read and
// write side of its own settings: the admin-only settings CRUD (GET/PUT /api/transcription-settings)
// and the actual per-request transcription proxy (POST /api/transcribe) that every logged-in user
// can call - not just admins, since dictation is a feature for the whole user base, only its
// configuration is admin-gated.
[ApiController]
[Authorize]
public class TranscriptionController : ControllerBase
{
    // 25 MB - matches OpenAI's own upload limit for /v1/audio/transcriptions, and is generous for
    // a short dictated note (several minutes of compressed audio) while still bounding request size
    // against abuse (a large multipart upload tying up backend/provider resources).
    private const long MaxAudioFileSizeBytes = 25 * 1024 * 1024;

    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/wave",
        "audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/flac"
    };

    private readonly PmDbContextBase _db;
    private readonly TranscriptionSettingsService _settingsService;
    private readonly WhisperTranscriptionService _whisperService;
    private readonly OpenAiTranscriptionService _openAiService;
    private readonly GoogleTranscriptionService _googleService;
    private readonly ILogger<TranscriptionController> _logger;

    public TranscriptionController(
        PmDbContextBase db,
        TranscriptionSettingsService settingsService,
        WhisperTranscriptionService whisperService,
        OpenAiTranscriptionService openAiService,
        GoogleTranscriptionService googleService,
        ILogger<TranscriptionController> logger)
    {
        _db = db;
        _settingsService = settingsService;
        _whisperService = whisperService;
        _openAiService = openAiService;
        _googleService = googleService;
        _logger = logger;
    }

    [HttpGet("api/transcription-settings")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<TranscriptionSettingsResponse>> GetSettings(CancellationToken ct)
    {
        var settings = await _db.TranscriptionSettings.FindAsync([Models.TranscriptionSettings.SingletonId], ct);

        // No row yet (fresh install, migration ran but nothing was ever saved) - report the model's
        // own defaults rather than a 404, since "not configured yet" is a normal, expected state for
        // this singleton, not an error.
        settings ??= new Models.TranscriptionSettings();

        return Ok(new TranscriptionSettingsResponse(
            settings.Provider,
            settings.WhisperEndpointUrl,
            settings.Language,
            HasOpenAiKey: !string.IsNullOrEmpty(settings.OpenAiApiKeyEncrypted),
            HasGoogleKey: !string.IsNullOrEmpty(settings.GoogleApiKeyEncrypted),
            settings.AutoSummarize));
    }

    [HttpPut("api/transcription-settings")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<TranscriptionSettingsResponse>> UpdateSettings(UpdateTranscriptionSettingsRequest request, CancellationToken ct)
    {
        var settings = await _db.TranscriptionSettings.FindAsync([Models.TranscriptionSettings.SingletonId], ct);
        if (settings is null)
        {
            settings = new Models.TranscriptionSettings();
            _db.TranscriptionSettings.Add(settings);
        }

        settings.Provider = request.Provider;
        settings.WhisperEndpointUrl = string.IsNullOrWhiteSpace(request.WhisperEndpointUrl) ? null : request.WhisperEndpointUrl.Trim();
        settings.Language = request.Language;
        settings.AutoSummarize = request.AutoSummarize;

        // Tri-state key handling - see UpdateTranscriptionSettingsRequest's doc comment: null means
        // "leave untouched", "" means "clear", anything else means "encrypt and replace".
        if (request.OpenAiApiKey is not null)
        {
            settings.OpenAiApiKeyEncrypted = request.OpenAiApiKey.Length == 0
                ? null
                : _settingsService.Encrypt(request.OpenAiApiKey);
        }

        if (request.GoogleApiKey is not null)
        {
            settings.GoogleApiKeyEncrypted = request.GoogleApiKey.Length == 0
                ? null
                : _settingsService.Encrypt(request.GoogleApiKey);
        }

        settings.UpdatedAt = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(ct);

        return Ok(new TranscriptionSettingsResponse(
            settings.Provider,
            settings.WhisperEndpointUrl,
            settings.Language,
            HasOpenAiKey: !string.IsNullOrEmpty(settings.OpenAiApiKeyEncrypted),
            HasGoogleKey: !string.IsNullOrEmpty(settings.GoogleApiKeyEncrypted),
            settings.AutoSummarize));
    }

    // Every logged-in user can dictate - [Authorize] on the class already covers that, no
    // additional role restriction here. The multipart file field is expected to be named "audio".
    [HttpPost("api/transcribe")]
    [RequestSizeLimit(MaxAudioFileSizeBytes)]
    public async Task<IActionResult> Transcribe(IFormFile? audio, CancellationToken ct)
    {
        if (audio is null || audio.Length == 0)
        {
            return BadRequest("Keine Audiodatei übermittelt.");
        }

        if (audio.Length > MaxAudioFileSizeBytes)
        {
            return BadRequest("Audiodatei zu groß (maximal 25 MB).");
        }

        var contentType = audio.ContentType;
        if (string.IsNullOrWhiteSpace(contentType) || !AllowedContentTypes.Contains(contentType))
        {
            return BadRequest("Nicht unterstützter Audio-Dateityp.");
        }

        var settings = await _db.TranscriptionSettings.FindAsync([Models.TranscriptionSettings.SingletonId], ct);
        if (settings is null)
        {
            return BadRequest("Spracherkennung ist nicht konfiguriert.");
        }

        ITranscriptionProvider provider = settings.Provider switch
        {
            TranscriptionProvider.Whisper => _whisperService,
            TranscriptionProvider.OpenAI => _openAiService,
            TranscriptionProvider.Google => _googleService,
            // Browser transcribes entirely client-side (Web Speech API) and should never reach this
            // endpoint at all - the frontend only shows/uses the dictation button server-side path
            // for the other three providers. If it does arrive here (stale client, misconfigured
            // settings changed mid-session, direct API call), fail clearly rather than silently
            // guessing a provider.
            _ => throw new TranscriptionConfigurationException(
                "Der Browser-Provider wird clientseitig verarbeitet und benötigt keinen Server-Aufruf.")
        };

        try
        {
            await using var stream = audio.OpenReadStream();
            var text = await provider.TranscribeAsync(stream, contentType, settings.Language, ct);
            return Ok(new { text });
        }
        catch (TranscriptionConfigurationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (TranscriptionUpstreamException ex)
        {
            // Never forward ex.Message's provider-side details to the client (see the exception's
            // own doc comment) - the concrete failure is already logged by the provider service
            // itself before this exception was thrown. Generic message only, plus the exception here
            // for correlation in case something upstream of the provider call itself failed.
            _logger.LogError(ex, "Transkription fehlgeschlagen (Provider: {Provider})", settings.Provider);
            return StatusCode(StatusCodes.Status502BadGateway, "Transkriptionsdienst nicht erreichbar oder hat die Anfrage abgelehnt.");
        }
    }
}
