/**
 * Runs `./machine` against the microphone, the clock and the two stores:
 * holds the recording, turns each effect into a call on a port and each
 * result into an event. It decides nothing; `step` does.
 */
import {
  SOUNDBITE_MAX_MS,
  SOUNDBITE_MIN_MS,
} from "@some-ui/soundbites/contract"
import type {
  BlobShelf,
  VoiceNoteOutcome as Outcome,
  StartRecording,
  VoiceNoteEffect as VoiceEffect,
  VoiceNoteEvent as VoiceEvent,
  VoiceNoteState as VoiceState,
} from "@some-ui/voice-capture"
import {
  initialVoiceNote,
  ShelfFullError,
  stepVoiceNote,
  takeRunner,
} from "@some-ui/voice-capture"

import type { KeepResult, Reflection } from "@/lib/session-reflection"

/** A take is a soundbite's length: the soundbites page records to these. */
const LIMITS = { minMs: SOUNDBITE_MIN_MS, maxMs: SOUNDBITE_MAX_MS }

export type VoicePorts = {
  startRecording: StartRecording
  audio: BlobShelf
  keep: (reflection: Reflection) => KeepResult
  letGo: (ids: ReadonlyArray<string>) => void
  /** A kept voice reflection whose audio is being written, and when done. */
  saving: (id: string, inFlight: boolean) => void
  /** Milliseconds since the epoch. */
  now: () => number
  newId: () => string
}

export type VoiceRuntime = {
  getSnapshot: () => VoiceState
  subscribe: (listener: () => void) => () => void
  /** `atMs`: how far into the session, read as the take starts. */
  start: (atMs: number | null) => void
  stop: () => void
  /** The sheet closed or the session ended: a take under way is kept. */
  leave: () => void
}

const TICK_MS = 200

export function createVoiceNote(
  ports: VoicePorts,
  sessionId: string
): VoiceRuntime {
  let state: VoiceState = initialVoiceNote
  const listeners = new Set<() => void>()

  const dispatch = (event: VoiceEvent): void => {
    const next = stepVoiceNote(state, event, LIMITS)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  const take = takeRunner(
    { startRecording: ports.startRecording, now: ports.now, tickMs: TICK_MS },
    dispatch
  )

  /**
   * The reflection first, so it holds its slot (or says there is none), then
   * its audio; audio that cannot be kept takes the reflection back out. In
   * that order, audio on the shelf always has a reflection naming it, and
   * `sweepOrphans` can never remove a take still being saved. If taking it
   * back out is refused too, `sweepOrphans` lets it go at the next launch.
   */
  const save = (effect: Extract<VoiceEffect, { type: "save" }>): void => {
    const id = ports.newId()
    const { take } = effect
    const kept = ports.keep({
      id,
      sessionId,
      createdAt: new Date(ports.now()).toISOString(),
      atMs: effect.atMs,
      body: {
        kind: "voice",
        durationMs: Math.round(take.durationMs),
        mimeType: take.mimeType,
        bytes: take.blob.size,
      },
    })
    if (kept !== "kept") {
      dispatch({ type: "saved", outcome: kept })
      return
    }
    ports.saving(id, true)
    ports.audio.put(id, take.blob).then(
      () => {
        ports.saving(id, false)
        dispatch({ type: "saved", outcome: "kept" })
      },
      (error: unknown) => {
        ports.saving(id, false)
        ports.letGo([id])
        const outcome: Outcome =
          error instanceof ShelfFullError ? "full" : "failed"
        dispatch({ type: "saved", outcome })
      }
    )
  }

  function run(effect: VoiceEffect): void {
    if (effect.type === "save") save(effect)
    else take.run(effect)
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    start: (atMs) => dispatch({ type: "start", atMs }),
    stop: () => dispatch({ type: "stop" }),
    leave: () => dispatch({ type: "left" }),
  }
}
