import { useEffect, useRef, useState } from 'react'

const BAR_COUNT = 9
// Smoothing factor for the easing applied on top of the raw FFT read (0..1, higher = snappier).
// Per-bar exponential smoothing reads as "reacting to your voice" without the visual jitter of
// wiring the raw per-frame values straight into the DOM - a flat "listening" bar shouldn't visibly
// flicker on FFT noise alone.
const EASING = 0.35
const MIN_BAR = 0.04

/**
 * Live microphone input levels for the equalizer visualization in DictationButton, split into
 * `BAR_COUNT` frequency-band bars in the 0..1 range. Purely an analysis tap - the stream is never
 * connected to `audioContext.destination`, so nothing is ever audibly played back.
 *
 * Takes an already-acquired `MediaStream` rather than requesting one itself, since the two
 * recording paths in DictationButton acquire their stream differently (MediaRecorder path already
 * holds one in `streamRef`; the Web Speech API path has no stream of its own and must request a
 * separate one just for this visualization - see `DictationButton.tsx`'s `startBrowserRecognition`
 * for that extra `getUserMedia` call). This hook only owns the `AudioContext`/`AnalyserNode`
 * lifecycle, not stream acquisition, so both callers can share the exact same analysis logic.
 */
const RESTING_LEVELS: number[] = Array(BAR_COUNT).fill(MIN_BAR)

export function useMicLevels(stream: MediaStream | null): number[] {
  // No internal "resting" state needed for the no-stream case - just return the shared constant
  // directly rather than syncing it into state from inside the effect below (React's
  // react-hooks/set-state-in-effect rule flags a synchronous setState in an effect body; deriving
  // the idle value during render instead of via an effect side-channel avoids that entirely).
  const [levels, setLevels] = useState<number[]>(RESTING_LEVELS)
  const smoothedRef = useRef<number[]>(RESTING_LEVELS)

  useEffect(() => {
    if (!stream) return

    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext
    if (!AudioContextCtor) return

    const audioContext = new AudioContextCtor()
    const analyser = audioContext.createAnalyser()
    // fftSize=128 -> 64 frequency bins, grouped further down into BAR_COUNT bars - coarse enough
    // to look like a handful of distinct mixer bars rather than a dense spectrum, cheap to run
    // every animation frame.
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.6
    const source = audioContext.createMediaStreamSource(stream)
    // Deliberately NOT connected to audioContext.destination - this tap is analysis-only, the
    // recording/transcription itself is handled entirely by MediaRecorder/SpeechRecognition.
    source.connect(analyser)

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const binsPerBar = Math.max(1, Math.floor(dataArray.length / BAR_COUNT))
    let frameId = 0

    function tick() {
      analyser.getByteFrequencyData(dataArray)
      const next = smoothedRef.current.map((prev, i) => {
        const start = i * binsPerBar
        let sum = 0
        for (let b = start; b < start + binsPerBar; b++) sum += dataArray[b] ?? 0
        const raw = sum / binsPerBar / 255
        const target = Math.max(MIN_BAR, raw)
        // Exponential ease toward the new reading instead of snapping straight to it.
        return prev + (target - prev) * EASING
      })
      smoothedRef.current = next
      setLevels(next)
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frameId)
      source.disconnect()
      analyser.disconnect()
      void audioContext.close()
      smoothedRef.current = RESTING_LEVELS
      setLevels(RESTING_LEVELS)
    }
  }, [stream])

  return levels
}
