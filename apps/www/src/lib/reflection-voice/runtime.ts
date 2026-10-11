/**
 * Runs `./machine` against the microphone, the clock and the two stores:
 * holds the recording, turns each effect into a call on a port and each
 * result into an event. It decides nothing; `step` does.
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  BlobShelf,
  Recording,
  StartRecording,
} from "@some-ui/voice-capture"
import { RecordingError, ShelfFullError } from "@some-ui/voice-capture"

import type { KeepResult, Reflection } from "@/lib/session-reflection"

import type { Outcome, VoiceEffect, VoiceEvent, VoiceState } from "./machine"
import { initialVoice, step } from "./machine"

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
  let state: VoiceState = initialVoice
  let recording: Recording | null = null
  let clock: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<() => void>()

  const dispatch = (event: VoiceEvent): void => {
    const next = step(state, event)
    if (next.state !== state) {
      state = next.state
      for (const listener of listeners) listener()
    }
    for (const effect of next.effects) run(effect)
  }

  const stopClock = (): void => {
    if (clock !== null) clearInterval(clock)
    clock = null
  }

  /**
   * The reflection first, so it holds its slot (or says there is none), then
   * its audio; audio that cannot be kept takes the reflection back out. In
   * that order, audio on the shelf always has a reflection naming it, and
   * `sweepOrphanAudio` can never remove a take still being saved.
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
    switch (effect.type) {
      case "openMic": {
        ports.startRecording().then(
          (opened) => {
            recording?.discard()
            recording = opened
            dispatch({ type: "micOpened", at: ports.now() })
          },
          (error: unknown) =>
            dispatch({
              type: "micFailed",
              reason: error instanceof RecordingError ? error.reason : "failed",
            })
        )
        return
      }
      case "startClock": {
        stopClock()
        clock = setInterval(
          () => dispatch({ type: "ticked", now: ports.now() }),
          TICK_MS
        )
        return
      }
      case "stopClock": {
        stopClock()
        return
      }
      case "finishTake": {
        const finishing = recording
        recording = null
        if (finishing === null) {
          dispatch({ type: "takeFailed" })
          return
        }
        finishing.finish().then(
          (take) => dispatch({ type: "taken", take }),
          () => dispatch({ type: "takeFailed" })
        )
        return
      }
      case "discardTake": {
        recording?.discard()
        recording = null
        return
      }
      case "save": {
        save(effect)
        return
      }
      default: {
        assertNever(effect)
      }
    }
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
    stop: () => dispatch({ type: "stop", now: ports.now() }),
    leave: () => dispatch({ type: "left" }),
  }
}
