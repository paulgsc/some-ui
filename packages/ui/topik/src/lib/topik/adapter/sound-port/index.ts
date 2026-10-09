/**
 * The drama's sound port: makjang's `SoundPort` (`media.ts`), a scene's
 * feeling as its tone, synthesized with Web Audio from `@some-ui/styles`'
 * `feelingTone`, then its cry (`FEELING_WORDS`), said through the page's
 * `Speaker` once the tone has ended (docs/makjang/README.md, "Where the
 * anchor goes").
 *
 * Sound is off until the learner turns it on, and the choice is kept on the
 * device (`SoundControl`).
 *
 * `AudioContext` is not ours, so a tone waits through `callForeign` (F1): by
 * a deadline, with a failure reported through `reportFailure`. A browser
 * that cannot make one at all gets no port, and one whose context fails as
 * `unavailable` withdraws the control. Each tone makes its own context and
 * closes it when the tone ends, so nothing outlives a sting and a phone that
 * suspends an idle context never holds a stale one. `@some-ui/speech`'s
 * audio player is not used: it plays fetched files, is internal to that
 * package, and would make its own context too.
 */

import {
  audioContextConstructor,
  localStorageOrNull,
} from "@some-ui/core-utils"
import type {
  ForeignOutcome,
  ForeignPort,
  ForeignVerdict,
} from "@some-ui/intent-kit"
import {
  callForeign,
  ForeignDeadlineError,
  reportFailure,
} from "@some-ui/intent-kit"
import type { Presented, SoundPort } from "@some-ui/makjang"
import type { Speaker } from "@some-ui/speech"
import type { FeelingTone } from "@some-ui/styles/theme"
import { feelingTone, isFeelingKey } from "@some-ui/styles/theme"
import type { StorageLike } from "@topik/lib/topik/adapter/resume-point"
import { sayKorean } from "@topik/lib/topik/adapter/voice-port"
import { FEELING_WORDS } from "@topik/lib/topik/core/feeling"

// ── The control ─────────────────────────────────────────────────────────────

/** `withdrawn` once this browser has shown it cannot play a tone. */
type SoundState = "off" | "on" | "withdrawn"

/** The sound toggle's state: what the chrome shows and the port obeys. */
export type SoundControl = {
  state(): SoundState
  /** The learner's toggle; kept on the device. No-op once withdrawn. */
  set(on: boolean): void
  withdraw(): void
  subscribe(listener: () => void): () => void
}

export const SOUND_STORAGE_KEY = "topik:drama-sound"

/** Off unless this device was left on. */
export function createSoundControl(
  storage: StorageLike | null = localStorageOrNull()
): SoundControl {
  const read = (): boolean => {
    try {
      return storage?.getItem(SOUND_STORAGE_KEY) === "on"
    } catch {
      return false
    }
  }
  let state: SoundState = read() ? "on" : "off"
  const listeners = new Set<() => void>()
  const become = (next: SoundState): void => {
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }
  return {
    state: () => state,
    set: (on): void => {
      if (state === "withdrawn") return
      try {
        storage?.setItem(SOUND_STORAGE_KEY, on ? "on" : "off")
      } catch {
        // Quota, privacy mode: it is on for this page, just not remembered.
      }
      become(on ? "on" : "off")
    },
    withdraw: () => become("withdrawn"),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

// ── The tone ────────────────────────────────────────────────────────────────

export type ToneContext = Pick<
  AudioContext,
  | "state"
  | "currentTime"
  | "sampleRate"
  | "destination"
  | "resume"
  | "close"
  | "createOscillator"
  | "createGain"
  | "createBuffer"
  | "createBufferSource"
  | "createBiquadFilter"
>

/** Makes a context; called inside the tap that plays the tone. */
export type ToneContextFactory = () => ToneContext

function browserToneContext(): ToneContextFactory | null {
  const Context = audioContextConstructor()
  return Context ? (): ToneContext => new Context() : null
}

/** How long a tone may take beyond its own length before it is given up. */
const TONE_SLACK_MS = 1500

/** A context the browser would not make: no retry here can help. */
const UNAVAILABLE: ForeignVerdict = {
  kind: "unavailable",
  retryable: false,
  summary: "This browser can't play sound.",
}

function classifyTone(error: unknown): ForeignVerdict {
  if (error instanceof ForeignDeadlineError) {
    return {
      kind: "unknown",
      retryable: true,
      summary: "The sound didn't finish playing.",
    }
  }
  if (error instanceof DOMException && error.name === "NotSupportedError") {
    return UNAVAILABLE
  }
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return {
      kind: "rejected",
      retryable: true,
      summary: "The browser blocked the sound.",
    }
  }
  return {
    kind: "unknown",
    retryable: true,
    summary: "The sound couldn't play.",
  }
}

const TONE_PORT: ForeignPort = {
  name: "web audio tone",
  classify: classifyTone,
  report: reportFailure,
}

/** Starts every note of `tone` on `context`; resolves when the last ends. */
function schedule(
  context: ToneContext,
  tone: FeelingTone,
  signal: AbortSignal
): Promise<void> {
  const t0 = context.currentTime + 0.03
  const sources: Array<AudioScheduledSourceNode> = []
  for (const note of tone.notes) {
    const start = t0 + note.at
    const end = start + note.length
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(note.level, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    gain.connect(context.destination)
    const source = ((): AudioScheduledSourceNode => {
      if (note.wave !== "noise") {
        const oscillator = context.createOscillator()
        oscillator.type = note.wave
        oscillator.frequency.setValueAtTime(note.hz, start)
        oscillator.connect(gain)
        return oscillator
      }
      const frames = Math.ceil(context.sampleRate * note.length)
      const buffer = context.createBuffer(1, frames, context.sampleRate)
      const data = buffer.getChannelData(0)
      for (let index = 0; index < frames; index += 1) {
        data[index] = Math.random() * 2 - 1
      }
      const noise = context.createBufferSource()
      noise.buffer = buffer
      const band = context.createBiquadFilter()
      band.type = "bandpass"
      band.frequency.value = note.hz
      noise.connect(band)
      band.connect(gain)
      return noise
    })()
    sources.push(source)
    source.start(start)
    source.stop(end + 0.05)
  }
  return new Promise((resolve) => {
    let playing = sources.length
    const halt = (): void => {
      for (const source of sources) {
        source.onended = null
        try {
          source.stop()
        } catch {
          // Already stopped.
        }
      }
      resolve()
    }
    if (signal.aborted || playing === 0) {
      halt()
      return
    }
    signal.addEventListener("abort", halt, { once: true })
    for (const source of sources) {
      source.onended = (): void => {
        playing -= 1
        if (playing > 0) return
        signal.removeEventListener("abort", halt)
        resolve()
      }
    }
  })
}

function playTone(
  makeContext: ToneContextFactory,
  tone: FeelingTone,
  signal: AbortSignal
): Promise<ForeignOutcome<void>> {
  const call = callForeign({
    port: TONE_PORT,
    deadlineMs: tone.length * 1000 + TONE_SLACK_MS,
    start: async (stopped) => {
      const context = makeContext()
      try {
        if (context.state === "suspended") await context.resume()
        await schedule(context, tone, stopped)
      } finally {
        void context.close().catch(() => undefined)
      }
    },
  })
  if (signal.aborted) call.abandon()
  else signal.addEventListener("abort", call.abandon, { once: true })
  return call.outcome
}

// ── The port ────────────────────────────────────────────────────────────────

export type FeelingSoundOptions = {
  control: SoundControl
  /** The page's speech session; without one, a sting is its tone alone. */
  speaker: Speaker | null
  /** Defaults to the browser's `AudioContext`. */
  tones?: ToneContextFactory | null
}

/** The sound port, or `null` when this browser cannot play a tone at all. */
export function feelingSound({
  control,
  speaker,
  tones = browserToneContext(),
}: FeelingSoundOptions): SoundPort | null {
  if (tones === null) return null
  const cry = (text: string, signal: AbortSignal): Promise<Presented> =>
    speaker?.available
      ? sayKorean(speaker, text, { urgency: "next", signal })
      : Promise.resolve("unavailable")
  return {
    sting: async ({ feeling }, signal): Promise<Presented> => {
      if (control.state() !== "on" || !isFeelingKey(feeling)) {
        return "unavailable"
      }
      const tone = await playTone(tones, feelingTone(feeling), signal)
      if (tone.status === "abandoned") return "cancelled"
      if (tone.status === "failed") {
        if (tone.error.kind === "unavailable") control.withdraw()
        return "unavailable"
      }
      if (signal.aborted || control.state() !== "on") return "cancelled"
      return cry(FEELING_WORDS[feeling].cry, signal)
    },
    audible: () => control.state() === "on",
    subscribe: (listener) => control.subscribe(listener),
  }
}
