/**
 * @module adapters/web-speech
 *
 * Speech via the browser's own `speechSynthesis`. No backend, no network -
 * which is exactly why it is the GitHub Pages fallback: that build ships no
 * companion services at all, so an HTTP adapter there would fail on every
 * utterance.
 *
 * The browser's voices are the browser's: which ones exist depends on the
 * device, and they are not ours to list or let a person choose among. A line
 * gives this adapter its language, one of ours (`lib/language`); the adapter
 * reads each browser voice's tag into one of ours too (`spokenLanguageOf`),
 * and hands the line to the voice for that language, named explicitly
 * (`voiceForLanguage`) rather than left to the browser's guess from the tag
 * alone, so the voice `describe` reports is the voice that speaks. A browser
 * with no voice for the language reads the line in its default voice,
 * another language's, and `describe` says so. None of these ever becomes a
 * `VoiceConfig`, which describes the hosted catalogue only (`lib/voices`).
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

import type {
  SpeakOptions,
  SpeechAdapter,
  VoiceReport,
} from "@speech/lib/adapters/types"
import type { SpokenLanguage } from "@speech/lib/language"
import {
  isPreferredTag,
  LANGUAGE_TAG,
  spokenLanguageOf,
} from "@speech/lib/language"
import { createSpeechLedger } from "@speech/lib/promise"
import { createAbortError } from "@speech/lib/promise/abort"

export type WebSpeechAdapterOptions = {
  /** Injected in tests; defaults to `window.speechSynthesis`. */
  synthesis?: SpeechSynthesis
  /** Injected in tests; defaults to `SpeechSynthesisUtterance`. */
  utteranceFactory?: (text: string) => SpeechSynthesisUtterance
  /** The language of lines that don't say their own. */
  language?: SpokenLanguage
  /**
   * How long an empty voice list counts as "still loading" before it counts
   * as the browser's answer. Defaults to `VOICES_WAIT_MS`.
   */
  voicesWaitMs?: number
  rate?: number
  pitch?: number
}

/** Browser voices that mean "the user cancelled", not "synthesis failed". */
const CANCELLATION_REASONS: ReadonlyArray<string> = ["canceled", "interrupted"]

/** Chrome announces its voices within a few hundred milliseconds. */
const VOICES_WAIT_MS = 3000

const DEFAULT_RATE = 0.98
const DEFAULT_PITCH = 1

function resolveSynthesis(
  provided: SpeechSynthesis | undefined
): SpeechSynthesis | null {
  if (provided) return provided
  if (typeof window === "undefined") return null
  return "speechSynthesis" in window ? window.speechSynthesis : null
}

/**
 * The browser voice for `language`: one with exactly the tag this package
 * would hand the browser, else any voice the browser files under that
 * language, preferring one that works offline.
 */
function voiceForLanguage(
  voices: ReadonlyArray<SpeechSynthesisVoice>,
  language: SpokenLanguage
): SpeechSynthesisVoice | null {
  const ranked = voices
    .filter((voice) => spokenLanguageOf(voice.lang) === language)
    .sort((a, b) => Number(b.localService) - Number(a.localService))
  return (
    ranked.find((voice) => isPreferredTag(voice.lang, language)) ??
    ranked[0] ??
    null
  )
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

  /** The live utterances' detaches, so a flush can release them all. */
  const attached = new Set<() => void>()

  // Chrome answers `getVoices()` with nothing until it has loaded them, and
  // says so with `voiceschanged`. Until then an empty list means "not yet",
  // not "none". But a browser with no voices may never announce (Linux
  // without a speech service), and an adapter built after the one
  // announcement never hears it, so the wait is bounded: past it, an empty
  // list is the browser's answer. A browser that cannot announce at all has
  // said all it will.
  const listeners = new Set<() => void>()
  const tell = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const canAnnounce = typeof synthesis?.addEventListener === "function"
  let loaded = !canAnnounce || synthesis.getVoices().length > 0
  // Lifetime: cleared by the first announcement or by `dispose`.
  let waitTimer: ReturnType<typeof setTimeout> | null = loaded
    ? null
    : setTimeout(() => {
        waitTimer = null
        loaded = true
        tell()
      }, options.voicesWaitMs ?? VOICES_WAIT_MS)
  const onVoicesChanged = (): void => {
    loaded = true
    if (waitTimer !== null) clearTimeout(waitTimer)
    waitTimer = null
    tell()
  }
  if (canAnnounce) {
    synthesis.addEventListener("voiceschanged", onVoicesChanged)
  }

  const cancelAll = (error: Error): void => {
    // Detach, then flush, then cancel: `cancel()` fires `onend` on the
    // utterance in flight, and a settled, detached entry can't be mistaken
    // for a clean finish by it. Detaching also drops the displaced caller's
    // abort listener, which would otherwise cancel whatever is speaking
    // when that caller's signal fires later.
    for (const detach of [...attached]) detach()
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
    const language = speakOptions.language ?? options.language
    if (language) {
      utterance.lang = LANGUAGE_TAG[language]
      const voice = voiceForLanguage(synthesis.getVoices(), language)
      if (voice) utterance.voice = voice
    }

    let abortListener: (() => void) | null = null

    const detach = (): void => {
      attached.delete(detach)
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
    attached.add(detach)
    speakOptions.signal?.addEventListener("abort", abortListener, {
      once: true,
    })
    synthesis.speak(utterance)

    return entry.promise
  }

  return {
    id: "web-speech",
    supported: synthesis !== null,
    // Browsers load their voices asynchronously and announce it; until then
    // `describe` can only report what has loaded so far. Subscribers hear
    // each announcement, and the end of the wait for one.
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    describe: (language): VoiceReport => {
      const voices = synthesis?.getVoices() ?? []
      const voice = voiceForLanguage(voices, language)
      if (voice) {
        return {
          platform: "browser",
          voice: voice.name,
          availability: "available",
        }
      }
      if (voices.length === 0 && !loaded) {
        return { platform: "browser", voice: null, availability: "checking" }
      }
      // What the browser falls back to for a language it has no voice for.
      const fallback = voices.find((candidate) => candidate.default) ?? null
      return {
        platform: "browser",
        voice: fallback?.name ?? null,
        availability: "missing",
      }
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
      if (canAnnounce) {
        synthesis.removeEventListener("voiceschanged", onVoicesChanged)
      }
      if (waitTimer !== null) clearTimeout(waitTimer)
      waitTimer = null
      listeners.clear()
      cancelAll(createAbortError("Speech adapter was disposed"))
    },
  }
}
