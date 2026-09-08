namespace Milepoint.Api.Services.Transcription;

// Thrown by an ITranscriptionProvider implementation for any failure that should surface to the
// caller as a specific, safe-to-show message (missing/invalid config, provider rejected the
// request, etc.) rather than an opaque 500. TranscriptionController maps this to the right HTTP
// status - see the two subclasses below for the two cases it distinguishes.
public abstract class TranscriptionProviderException(string message) : Exception(message);

// Configuration problem the admin needs to fix (no API key set, no endpoint configured, ...) -
// maps to 400 Bad Request. Safe to return the message as-is since it never echoes back
// provider-side error text (only ever references the local misconfiguration), only ever
// constructed with a fixed, developer-written string, never provider response content.
public sealed class TranscriptionConfigurationException(string message) : TranscriptionProviderException(message);

// The external provider (Whisper container / OpenAI / Google) itself failed or was unreachable -
// maps to 502 Bad Gateway. The concrete message shown to the client is always a generic, fixed
// string chosen by the controller, not this exception's Message - the actual provider error
// (which could echo request details or hint at the API key) is logged server-side only. See
// TranscriptionController.Transcribe's catch block.
public sealed class TranscriptionUpstreamException(string message, Exception? inner = null)
    : TranscriptionProviderException(message)
{
    public Exception? Inner { get; } = inner;
}

// Common contract for every server-side speech-to-text backend (Whisper/OpenAI/Google - Browser
// has no server-side implementation since Web Speech API transcription happens entirely
// client-side and never reaches the backend). TranscriptionController resolves the right
// implementation by TranscriptionSettings.Provider and calls this one method, so adding a future
// provider only means adding one more implementation + one more switch arm, not touching the
// controller's request-handling logic.
public interface ITranscriptionProvider
{
    // audio: the raw uploaded file stream, positioned at 0. contentType: the browser-reported MIME
    // type (e.g. "audio/webm"), forwarded as-is to providers that need it (OpenAI/Whisper multipart
    // uploads use the field's filename/content-type as a hint for format detection). language:
    // TranscriptionSettings.Language (e.g. "de-DE") - providers that only accept a bare ISO-639-1
    // code are responsible for trimming the region subtag themselves.
    // Throws TranscriptionConfigurationException / TranscriptionUpstreamException on failure -
    // never returns null/empty for a failure case, only for a legitimately empty transcript.
    Task<string> TranscribeAsync(Stream audio, string contentType, string language, CancellationToken ct);
}
