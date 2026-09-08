namespace Milepoint.Api.Models;

// Which speech-to-text backend TranscriptionSettings.Provider selects instance-wide.
public enum TranscriptionProvider
{
    // Uses the browser's built-in SpeechRecognition API client-side - no server config, no API
    // key, nothing to encrypt. Default so the feature works out of the box with zero admin setup.
    Browser,
    // Self-hosted Whisper (e.g. onerahmet/openai-whisper-asr-webservice) reachable at
    // WhisperEndpointUrl - no API key needed, the endpoint itself is the only required config.
    Whisper,
    OpenAI,
    Google
}
