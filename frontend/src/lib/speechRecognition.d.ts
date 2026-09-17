// Minimal ambient typings for the Web Speech API (SpeechRecognition), which TypeScript's own
// lib.dom.d.ts does not yet include as of the TS/DOM lib version this project targets. Only the
// members DictationButton.tsx actually uses are declared - this is not meant to be a complete
// spec typing. Also carries the `webkitAudioContext` fallback used by useMicLevels.ts (Safari
// still ships AudioContext only under the vendor-prefixed name).
export {}

declare global {
  interface SpeechRecognitionResult {
    readonly isFinal: boolean
    readonly length: number
    [index: number]: { readonly transcript: string; readonly confidence: number }
  }

  interface SpeechRecognitionResultList {
    readonly length: number
    [index: number]: SpeechRecognitionResult
  }

  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number
    readonly results: SpeechRecognitionResultList
  }

  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string
    readonly message: string
  }

  interface SpeechRecognition extends EventTarget {
    lang: string
    continuous: boolean
    interimResults: boolean
    maxAlternatives: number
    start(): void
    stop(): void
    abort(): void
    onresult: ((this: SpeechRecognition, event: SpeechRecognitionEvent) => void) | null
    onerror: ((this: SpeechRecognition, event: SpeechRecognitionErrorEvent) => void) | null
    onend: ((this: SpeechRecognition, event: Event) => void) | null
    onstart: ((this: SpeechRecognition, event: Event) => void) | null
  }

  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
    webkitAudioContext?: typeof AudioContext
  }
}
