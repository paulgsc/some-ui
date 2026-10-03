/**
 * @module adapters/native
 *
 * Speech through the operating system's own text-to-speech engine, reached
 * over a native bridge rather than through the page.
 *
 * This exists for the Android app. It runs in Android System WebView, which
 * does not implement Web Speech synthesis: `window.speechSynthesis` is
 * either missing or a stub with no voices that never speaks, so the
 * web-speech adapter there is silent while reporting itself supported
 * (#1625). Android's own `TextToSpeech` service does speak, offline, in any
 * language whose voice data is installed.
 *
 * The engine is injected, so this package never imports a bridge. The app
 * that has one (`apps/www`'s device build, over
 * `@capacitor-community/text-to-speech`) implements `NativeSpeechEngine` and
 * hands it to the session as `SpeechConfig.native`, which makes it the
 * session's device voice in place of the browser's. Everything here is the
 * part every such engine needs and none should re-derive: the settlement
 * laws from `../types`, which an engine's own promises do not keep.
 *
 * Like the browser's, the phone's voices are the platform's, not ours: a
 * line gives this adapter its language, and the engine speaks it in the
 * voice the person picked from the phone's own list (an opaque id from
 * `getVoices`) when that voice speaks the language, else its default.
 *
 * Two facts about the engine shape the code below:
 *
 * - **A replaced or stopped utterance may never settle.** The Capacitor
 *   plugin drops its pending callbacks on `stop()`, and `speak()` stops
 *   whatever was speaking first. So the adapter settles its own ledger
 *   entry on supersede and stop, and ignores whatever the engine does with
 *   the old promise afterwards.
 * - **A language without voice data is refused, not muddled through.**
 *   The adapter asks `isLanguageSupported` before the first utterance in a
 *   language and again after any refusal, so installing a voice while the
 *   app runs takes effect on the next utterance. A refusal rejects with a
 *   `VoiceMissingError` and calls `onMissingVoice`, which is how a person
 *   learns why nothing was said.
 */

import type { SpeakOptions, SpeechAdapter } from "@speech/lib/adapters/types"
import { createSpeechLedger } from "@speech/lib/promise"
import { createAbortError, toError } from "@speech/lib/promise/abort"

/** One voice the engine can speak with. */
export type NativeVoice = {
  /** Stable across launches (Android's `Voice.getName()`). */
  readonly id: string
  readonly name: string
  /** BCP-47 tag. */
  readonly lang: string
  /** False for a voice that needs the network to speak. */
  readonly local: boolean
}

export type NativeSpeechRequest = {
  readonly text: string
  readonly lang?: string
  /** A `NativeVoice.id`; absent means the engine's default for `lang`. */
  readonly voiceId?: string
  readonly rate: number
  readonly pitch: number
  readonly volume: number
}

/**
 * What a native bridge has to offer. Each method maps onto one plugin call;
 * none of them is expected to keep the settlement laws.
 */
export type NativeSpeechEngine = {
  /**
   * Speaks `request`, replacing whatever is speaking. Resolves when the
   * utterance finishes and rejects when it fails. A replaced or stopped
   * utterance may never settle at all.
   */
  speak: (request: NativeSpeechRequest) => Promise<void>
  stop: () => Promise<void>
  getVoices: () => Promise<ReadonlyArray<NativeVoice>>
  /** True when voice data for `lang` is installed and usable. */
  isLanguageSupported: (lang: string) => Promise<boolean>
}

export type NativeSpeechAdapterOptions = {
  engine: NativeSpeechEngine
  /** BCP-47 tag for utterances that don't carry a voice of their own. */
  lang?: string
  /**
   * The voice a person chose from the phone's list, as a `NativeVoice.id`.
   * It speaks every line in its own language; other lines get the engine's
   * default for theirs.
   */
  voiceId?: string
  rate?: number
  pitch?: number
  /** Called each time an utterance is refused for want of voice data. */
  onMissingVoice?: (lang: string) => void
}

export const VOICE_MISSING_ERROR_NAME = "VoiceMissingError"

function createVoiceMissingError(lang: string): Error {
  const error = new Error(`No text-to-speech voice is installed for ${lang}`)
  error.name = VOICE_MISSING_ERROR_NAME
  return error
}

const DEFAULT_RATE = 1
const DEFAULT_PITCH = 1

function sameLanguage(a: string, b: string): boolean {
  const primary = (tag: string): string =>
    tag.toLowerCase().split(/[-_]/)[0] ?? ""
  return primary(a) === primary(b)
}

export function createNativeSpeechAdapter(
  options: NativeSpeechAdapterOptions
): SpeechAdapter {
  const { engine } = options
  const ledger = createSpeechLedger()
  let disposed = false
  let volume = 1
  let playbackRate = options.rate ?? DEFAULT_RATE
  let voices: ReadonlyArray<NativeVoice> = []
  /** Only `true` is cached: a missing voice can be installed at any time. */
  const installed = new Set<string>()

  // Only to learn which language the chosen voice speaks. The list loads
  // over the bridge, so until it answers (or if it fails) the chosen voice
  // is not used, and lines get the engine's default for their language.
  engine.getVoices().then(
    (loaded) => {
      voices = loaded
    },
    () => undefined
  )

  const hasVoiceFor = async (lang: string): Promise<boolean> => {
    if (installed.has(lang)) return true
    // A probe that fails says nothing about the voice. Let the utterance
    // try, and let the engine's own error say what went wrong.
    const supported = await engine.isLanguageSupported(lang).catch(() => true)
    if (supported) installed.add(lang)
    return supported
  }

  const voiceIdFor = (lang: string | undefined): string | undefined => {
    const chosen = voices.find((voice) => voice.id === options.voiceId)
    if (chosen && (!lang || sameLanguage(chosen.lang, lang))) return chosen.id
    return undefined
  }

  const stopEngine = (): void => {
    void engine.stop().catch(() => undefined)
  }

  const speak = (
    text: string,
    speakOptions: SpeakOptions = {}
  ): Promise<void> => {
    if (disposed) {
      return Promise.reject(createAbortError("Speech adapter was disposed"))
    }
    if (speakOptions.signal?.aborted) {
      return Promise.reject(
        createAbortError("Speech aborted before it started")
      )
    }

    // One utterance at a time, as in the web-speech adapter. The engine
    // stops the old utterance itself when the new one reaches it, and may
    // never settle the old promise, so the displaced caller is rejected
    // here rather than left to whatever the engine does.
    ledger.flush(createAbortError("Superseded by a newer utterance"))

    const entry = ledger.open()
    const lang = speakOptions.lang ?? options.lang

    let abortListener: (() => void) | null = null
    const detach = (): void => {
      if (abortListener) {
        speakOptions.signal?.removeEventListener("abort", abortListener)
        abortListener = null
      }
    }
    const fail = (error: Error): void => {
      if (entry.isSettled()) return
      detach()
      speakOptions.onError?.(error)
      entry.reject(error)
    }

    abortListener = (): void => {
      detach()
      entry.reject(createAbortError("Speech aborted"))
      stopEngine()
    }
    speakOptions.signal?.addEventListener("abort", abortListener, {
      once: true,
    })

    const start = async (): Promise<void> => {
      if (lang && !(await hasVoiceFor(lang))) {
        // Superseded or stopped while the probe was out: nobody is
        // waiting on this utterance any more, so nobody needs telling.
        if (entry.isSettled()) return
        options.onMissingVoice?.(lang)
        fail(createVoiceMissingError(lang))
        return
      }
      if (entry.isSettled()) return

      speakOptions.onStart?.()
      await engine.speak({
        text,
        lang,
        voiceId: voiceIdFor(lang),
        rate: speakOptions.playbackRate ?? playbackRate,
        pitch: options.pitch ?? DEFAULT_PITCH,
        volume: speakOptions.volume ?? volume,
      })
      if (entry.isSettled()) return
      detach()
      speakOptions.onEnd?.()
      entry.resolve()
    }
    start().catch((error: unknown) => fail(toError(error)))

    return entry.promise
  }

  const stop = (): void => {
    ledger.flush(createAbortError("Speech stopped"))
    stopEngine()
  }

  return {
    id: "native",
    supported: true,
    get pending(): number {
      return ledger.size
    },
    speak,
    stop,
    // The engine has no pause. Stopping is the honest mapping: a "paused"
    // utterance that keeps talking is worse than one that ends.
    pause: stop,
    resume: (): void => undefined,
    setVolume: (next: number): void => {
      volume = Math.max(0, Math.min(1, next))
    },
    setPlaybackRate: (rate: number): void => {
      playbackRate = Math.max(0.1, Math.min(4, rate))
    },
    dispose: (): void => {
      if (disposed) return
      disposed = true
      ledger.flush(createAbortError("Speech adapter was disposed"))
      stopEngine()
    },
  }
}
