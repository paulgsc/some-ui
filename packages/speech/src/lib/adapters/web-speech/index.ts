/**
 * @module adapters/web-speech
 *
 * Speech via the browser's own `speechSynthesis`. No backend, no network -
 * which is exactly why it is the GitHub Pages fallback: that build ships no
 * companion services at all, so an HTTP adapter there would fail on every
 * utterance.
 *
 * Three settlement bugs from the call sites this replaces are fixed here,
 * and pinned by `adapter-contract.test.ts`:
 *
 * - `utterance.onerror = () => resolve()` reported every failure as a clean
 *   finish, so a queue built on it counted failures as successes and never
 *   retried. Errors reject now; only the browser's own "cancelled" and
 *   "interrupted" reasons map to an `AbortError`.
 * - `speechSynthesis.cancel()` at the top of `speak()` silently killed the
 *   previous utterance, whose promise then settled as if it had finished.
 *   Cancellation now flushes the ledger first, so the displaced caller
 *   learns it was cancelled.
 * - Nothing tore the utterance's handlers down, so a stale utterance could
 *   settle a promise belonging to the next one.
 */

import type { SpeakOptions, SpeechAdapter } from "@speech/lib/adapters/types"
import { createSpeechLedger } from "@speech/lib/promise"
import { createAbortError } from "@speech/lib/promise/abort"
import type { VoiceConfig } from "@speech/lib/types/tts-types"

export type WebSpeechAdapterOptions = {
  /** Injected in tests; defaults to `window.speechSynthesis`. */
  synthesis?: SpeechSynthesis
  /** Injected in tests; defaults to `SpeechSynthesisUtterance`. */
  utteranceFactory?: (text: string) => SpeechSynthesisUtterance
  /** BCP-47 tag for utterances that don't carry a voice of their own. */
  lang?: string
  rate?: number
  pitch?: number
}

/** Browser voices that mean "the user cancelled", not "synthesis failed". */
const CANCELLATION_REASONS: ReadonlyArray<string> = ["canceled", "interrupted"]

const DEFAULT_RATE = 0.98
const DEFAULT_PITCH = 1

function resolveSynthesis(
  provided: SpeechSynthesis | undefined
): SpeechSynthesis | null {
  if (provided) return provided
  if (typeof window === "undefined") return null
  return "speechSynthesis" in window ? window.speechSynthesis : null
}

function toVoiceConfig(voice: SpeechSynthesisVoice): VoiceConfig {
  return {
    id: voice.voiceURI,
    name: voice.name,
    // The `TTSProvider` union describes TTS *vendors*; a browser voice
    // belongs to none of them, and "custom" is the union's escape hatch.
    provider: "custom",
    language: voice.lang,
  }
}

export function createWebSpeechAdapter(
  options: WebSpeechAdapterOptions = {}
): SpeechAdapter {
  const synthesis = resolveSynthesis(options.synthesis)
  const createUtterance =
    options.utteranceFactory ??
    ((text: string): SpeechSynthesisUtterance =>
      new SpeechSynthesisUtterance(text))

  const ledger = createSpeechLedger()
  let disposed = false
  let volume = 1
  let playbackRate = options.rate ?? DEFAULT_RATE

  const cancelAll = (error: Error): void => {
    // Flush before cancelling: `cancel()` fires `onend` on the utterance in
    // flight, and an entry that is already settled can't be mistaken for a
    // clean finish by that handler.
    ledger.flush(error)
    synthesis?.cancel()
  }

  const speak = (
    text: string,
    speakOptions: SpeakOptions = {}
  ): Promise<void> => {
    if (disposed) {
      return Promise.reject(createAbortError("Speech adapter was disposed"))
    }
    if (!synthesis) {
      return Promise.reject(
        new Error("speechSynthesis is not available in this runtime")
      )
    }
    if (speakOptions.signal?.aborted) {
      return Promise.reject(
        createAbortError("Speech aborted before it started")
      )
    }

    // One utterance at a time: this adapter has no queue of its own, so a
    // new request displaces the current one rather than overlapping it. The
    // displaced caller is rejected, not silently resolved.
    cancelAll(createAbortError("Superseded by a newer utterance"))

    const entry = ledger.open()
    const utterance = createUtterance(text)
    utterance.rate = speakOptions.playbackRate ?? playbackRate
    utterance.pitch = options.pitch ?? DEFAULT_PITCH
    utterance.volume = speakOptions.volume ?? volume
    const lang = speakOptions.voice?.language ?? options.lang
    if (lang) utterance.lang = lang

    let abortListener: (() => void) | null = null

    const detach = (): void => {
      utterance.onstart = null
      utterance.onend = null
      utterance.onerror = null
      utterance.onboundary = null
      if (abortListener) {
        speakOptions.signal?.removeEventListener("abort", abortListener)
        abortListener = null
      }
    }

    utterance.onstart = (): void => speakOptions.onStart?.()
    utterance.onboundary = (event): void => {
      speakOptions.onBoundary?.(event.charIndex, event.charLength)
    }
    utterance.onend = (): void => {
      if (entry.isSettled()) return
      detach()
      speakOptions.onEnd?.()
      entry.resolve()
    }
    utterance.onerror = (event): void => {
      if (entry.isSettled()) return
      detach()
      if (CANCELLATION_REASONS.includes(event.error)) {
        entry.reject(createAbortError(`Speech ${event.error}`))
        return
      }
      const failure = new Error(`speechSynthesis error: ${event.error}`)
      speakOptions.onError?.(failure)
      entry.reject(failure)
    }

    abortListener = (): void => {
      detach()
      entry.reject(createAbortError("Speech aborted"))
      synthesis.cancel()
    }
    speakOptions.signal?.addEventListener("abort", abortListener, {
      once: true,
    })
    synthesis.speak(utterance)

    return entry.promise
  }

  return {
    id: "web-speech",
    supported: synthesis !== null,
    get voices(): ReadonlyArray<VoiceConfig> {
      // Voices load asynchronously in every browser, so this has to be read
      // at access time rather than captured at construction.
      return synthesis?.getVoices().map(toVoiceConfig) ?? []
    },
    get pending(): number {
      return ledger.size
    },
    speak,
    stop: (): void => cancelAll(createAbortError("Speech stopped")),
    pause: (): void => synthesis?.pause(),
    resume: (): void => synthesis?.resume(),
    setVolume: (next: number): void => {
      volume = Math.max(0, Math.min(1, next))
    },
    setPlaybackRate: (rate: number): void => {
      playbackRate = Math.max(0.1, Math.min(4, rate))
    },
    dispose: (): void => {
      if (disposed) return
      disposed = true
      cancelAll(createAbortError("Speech adapter was disposed"))
    },
  }
}
