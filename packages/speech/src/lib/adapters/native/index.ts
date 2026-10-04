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

import type {
  DeviceVoiceChoice,
  SpeakOptions,
  SpeechAdapter,
  VoiceAvailability,
  VoiceReport,
} from "@speech/lib/adapters/types"
import type { SpokenLanguage } from "@speech/lib/language"
import { LANGUAGE_NAME } from "@speech/lib/language"
import { createSpeechLedger } from "@speech/lib/promise"
import { createAbortError, toError } from "@speech/lib/promise/abort"

/**
 * One voice the engine can speak with, as the engine's transport hands it
 * over: already in this package's terms. The platform's tag for its
 * language is read by the transport (`spokenLanguageOf`), never here.
 */
export type NativeVoice = {
  /**
   * Stable across launches (Android's `Voice.getName()`). Opaque: only ever
   * compared, and handed back to the engine.
   */
  readonly id: string
  /** A name to show a person. */
  readonly name: string
  /** The language it reads, or `null` for one this site does not speak. */
  readonly language: SpokenLanguage | null
  /** False for a voice that needs the network to speak. */
  readonly local: boolean
}

export type NativeSpeechRequest = {
  readonly text: string
  readonly language?: SpokenLanguage
  /** A `NativeVoice.id`; absent means the engine's default for `language`. */
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
  /** True when voice data for `language` is installed and usable. */
  isLanguageSupported: (language: SpokenLanguage) => Promise<boolean>
  /**
   * Calls `listener` when the app returns to the front, where a voice
   * installed from the system settings (the Install button's round trip)
   * shows up. Returns the unsubscribe.
   */
  subscribeResume?: (listener: () => void) => () => void
}

export type NativeSpeechAdapterOptions = {
  engine: NativeSpeechEngine
  /** The language of lines that don't say their own. */
  language?: SpokenLanguage
  /**
   * The voice a person chose from the phone's list, as a `NativeVoice.id`.
   * It speaks every line in its own language; other lines get the engine's
   * default for theirs.
   */
  voiceId?: string
  rate?: number
  pitch?: number
  /** Called each time an utterance is refused for want of voice data. */
  onMissingVoice?: (language: SpokenLanguage) => void
}

export const VOICE_MISSING_ERROR_NAME = "VoiceMissingError"

function createVoiceMissingError(language: SpokenLanguage): Error {
  const error = new Error(
    `No text-to-speech voice is installed for ${LANGUAGE_NAME[language]}`
  )
  error.name = VOICE_MISSING_ERROR_NAME
  return error
}

const DEFAULT_RATE = 1
const DEFAULT_PITCH = 1

export function createNativeSpeechAdapter(
  options: NativeSpeechAdapterOptions
): SpeechAdapter {
  const { engine } = options
  const ledger = createSpeechLedger()
  let disposed = false
  let volume = 1
  let playbackRate = options.rate ?? DEFAULT_RATE
  let voices: ReadonlyArray<NativeVoice> = []
  /**
   * What the phone has said about each language: the engine's yes or no
   * (`available`, `missing`), a probe still out (`checking`), or a probe
   * that failed (`unverifiable`). Absent: never asked.
   */
  const availability = new Map<SpokenLanguage, VoiceAvailability>()
  /**
   * Whoever shows `describe`'s answer. The voice list and the probes answer
   * over the bridge after the first render, so each change is announced.
   */
  const listeners = new Set<() => void>()
  const announce = (): void => {
    for (const listener of [...listeners]) listener()
  }
  /** Each in-flight utterance's abort-listener detacher. */
  const attached = new Set<() => void>()

  /**
   * Settles every caller with `error`. Detaching first matters: a displaced
   * caller's signal that aborts later would otherwise stop the engine under
   * the utterance that replaced it, whose own promise may then never settle.
   */
  const settleAll = (error: Error): void => {
    for (const detach of [...attached]) detach()
    ledger.flush(error)
  }

  // Only to learn which language the chosen voice speaks. The list loads
  // over the bridge, so until it answers (or if it fails) the chosen voice
  // is not used, and lines get the engine's default for their language.
  engine.getVoices().then(
    (loaded) => {
      voices = loaded
      announce()
    },
    () => undefined
  )

  const setAvailability = (
    language: SpokenLanguage,
    next: VoiceAvailability
  ): void => {
    if (availability.get(language) === next) return
    availability.set(language, next)
    announce()
  }

  /**
   * The probe out for each language, so every line and every read waiting
   * on one shares it: two probes could answer out of order, leaving the
   * older answer standing.
   */
  const probes = new Map<SpokenLanguage, Promise<boolean>>()

  /**
   * Only `available` is trusted without asking again: a missing voice can
   * be installed at any time. A probe that fails says nothing about the
   * voice, so the line is tried and the engine's own error says what went
   * wrong (`unverifiable`), and the next line asks again.
   */
  const hasVoiceFor = (language: SpokenLanguage): Promise<boolean> => {
    if (availability.get(language) === "available") return Promise.resolve(true)
    const out = probes.get(language)
    if (out) return out
    if (!availability.has(language)) setAvailability(language, "checking")
    const probe = engine.isLanguageSupported(language).then(
      (supported) => {
        setAvailability(language, supported ? "available" : "missing")
        return supported
      },
      () => {
        setAvailability(language, "unverifiable")
        return true
      }
    )
    const settled = probe.finally(() => probes.delete(language))
    probes.set(language, settled)
    return settled
  }
  // A language found missing, or not checkable, is asked again when the
  // app comes back: the person may have just installed it.
  // Lifetime: ended by `dispose`.
  const unsubscribeResume = engine.subscribeResume?.(() => {
    if (disposed) return
    for (const [language, known] of availability) {
      if (known === "missing" || known === "unverifiable") {
        void hasVoiceFor(language)
      }
    }
  })

  // Probed up front for the session's own language, so `describe` can say
  // whether the phone speaks it before the first line is tried.
  if (options.language) void hasVoiceFor(options.language)

  const voiceIdFor = (
    language: SpokenLanguage | undefined
  ): string | undefined => {
    const chosen = voices.find((voice) => voice.id === options.voiceId)
    if (chosen && (!language || chosen.language === language)) return chosen.id
    return undefined
  }

  /**
   * The voice for one line: one the session named for it (Settings'
   * sample, which may name the engine's default), else the one the person
   * chose, when it reads the language.
   */
  const lineVoiceId = (
    voice: DeviceVoiceChoice | undefined,
    language: SpokenLanguage | undefined
  ): string | undefined => {
    if (!voice) return voiceIdFor(language)
    switch (voice.kind) {
      case "engine-default": {
        return undefined
      }
      case "voice": {
        return voice.id
      }
      default: {
        return assertNever(voice)
      }
    }
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
    settleAll(createAbortError("Superseded by a newer utterance"))

    const entry = ledger.open()
    const language = speakOptions.language ?? options.language

    let abortListener: (() => void) | null = null
    const detach = (): void => {
      attached.delete(detach)
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
    attached.add(detach)
    speakOptions.signal?.addEventListener("abort", abortListener, {
      once: true,
    })

    const start = async (): Promise<void> => {
      if (language && !(await hasVoiceFor(language))) {
        // Superseded or stopped while the probe was out: nobody is
        // waiting on this utterance any more, so nobody needs telling.
        if (entry.isSettled()) return
        options.onMissingVoice?.(language)
        fail(createVoiceMissingError(language))
        return
      }
      if (entry.isSettled()) return

      speakOptions.onStart?.()
      try {
        await engine.speak({
          text,
          language,
          voiceId: lineVoiceId(speakOptions.voice, language),
          rate: speakOptions.playbackRate ?? playbackRate,
          pitch: options.pitch ?? DEFAULT_PITCH,
          volume: speakOptions.volume ?? volume,
        })
      } catch (error) {
        // A voice removed from the phone's settings while the app runs
        // fails here, generically, though its language reads `available`.
        // Ask again, so the next line is refused as missing, with the
        // install guidance, and `describe` catches up.
        if (language) {
          setAvailability(language, "checking")
          void hasVoiceFor(language)
        }
        throw error
      }
      if (entry.isSettled()) return
      detach()
      speakOptions.onEnd?.()
      entry.resolve()
    }
    start().catch((error: unknown) => fail(toError(error)))

    return entry.promise
  }

  const stop = (): void => {
    settleAll(createAbortError("Speech stopped"))
    stopEngine()
  }

  return {
    id: "native",
    supported: true,
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    describe: (language): VoiceReport => {
      const chosen = voices.find((voice) => voice.id === voiceIdFor(language))
      const known = availability.get(language)
      // Never asked: ask now, after this read (whoever is reading may be
      // rendering, and the answer is announced), and say so meanwhile.
      if (!known) {
        queueMicrotask(() => {
          if (!disposed) void hasVoiceFor(language)
        })
      }
      return {
        platform: "phone",
        voice: chosen?.name ?? null,
        availability: known ?? "checking",
      }
    },
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
      unsubscribeResume?.()
      settleAll(createAbortError("Speech adapter was disposed"))
      listeners.clear()
      stopEngine()
    },
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected device voice choice: ${JSON.stringify(value)}`)
}
