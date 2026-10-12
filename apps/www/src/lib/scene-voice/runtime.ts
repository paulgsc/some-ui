/**
 * The next scene, said aloud: topik's `SceneVoice` port, run as a voice
 * reflection is. The take is `@some-ui/voice-capture`'s voice note (one at a
 * time; leaving mid-take keeps it), and each kept take is a note in one
 * draft: its audio on a shelf of its own, its entry in a list. The draft is
 * the only one there is, so a new scene starts from it until its notes are
 * let go (shared to the learner's drive, or discarded).
 */
import {
  SOUNDBITE_MAX_MS,
  SOUNDBITE_MIN_MS,
} from "@some-ui/soundbites/contract"
import type { SceneNote, SceneVoice, SceneVoiceSnapshot } from "@some-ui/topik"
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
  RECORDING_FAILURE_COPY,
  ShelfFullError,
  stepVoiceNote,
  takeRunner,
} from "@some-ui/voice-capture"

/** A note is a take of a soundbite's length. */
const LIMITS = { minMs: SOUNDBITE_MIN_MS, maxMs: SOUNDBITE_MAX_MS }

/** Notes one draft holds: a scene told in five minutes, a minute a take. */
export const SCENE_NOTES_MAX = 5

/** A note as the list keeps it. */
export type StoredNote = SceneNote & { mimeType: string }

export type SceneVoicePorts = {
  startRecording: StartRecording
  audio: BlobShelf
  /** The draft's notes, oldest first. */
  notes: {
    read: () => Array<StoredNote>
    /** Says whether the device stored it. */
    add: (note: StoredNote) => boolean
    remove: (ids: ReadonlyArray<string>) => boolean
  }
  /** A note whose audio is being written, and when done. */
  saving: (id: string, inFlight: boolean) => void
  now: () => number
  newId: () => string
}

const SAID: Record<Outcome, string> = {
  kept: "Kept.",
  short: "Too short to keep. Tap, talk, then tap again.",
  full: "This phone has no room for another voice note.",
  failed: "Couldn't keep that one. Try again.",
}

const TICK_MS = 200

function snapshotOf(
  state: VoiceState,
  notes: ReadonlyArray<StoredNote>
): SceneVoiceSnapshot {
  const full = notes.length >= SCENE_NOTES_MAX
  const take: SceneVoiceSnapshot["take"] =
    state.kind === "saving"
      ? { kind: "keeping" }
      : state.kind !== "taking"
        ? { kind: "idle" }
        : state.phase.kind === "opening"
          ? { kind: "opening" }
          : state.phase.kind === "recording"
            ? { kind: "recording", elapsedMs: state.phase.elapsed }
            : { kind: "keeping" }
  const said =
    state.kind === "blocked"
      ? RECORDING_FAILURE_COPY[state.reason]
      : state.kind === "idle" && state.last !== null
        ? SAID[state.last]
        : full
          ? `A scene holds ${SCENE_NOTES_MAX} voice notes: let one go to say more.`
          : null
  return {
    notes: notes.map(({ id, durationMs }) => ({ id, durationMs })),
    take,
    said,
    full,
  }
}

export function createSceneVoice(ports: SceneVoicePorts): SceneVoice {
  let state: VoiceState = initialVoiceNote
  let snapshot = snapshotOf(state, ports.notes.read())
  const listeners = new Set<() => void>()

  const publish = (): void => {
    snapshot = snapshotOf(state, ports.notes.read())
    for (const listener of listeners) listener()
  }

  const dispatch = (event: VoiceEvent): void => {
    const next = stepVoiceNote(state, event, LIMITS)
    if (next.state !== state) {
      state = next.state
      publish()
    }
    for (const effect of next.effects) run(effect)
  }

  const take = takeRunner(
    { startRecording: ports.startRecording, now: ports.now, tickMs: TICK_MS },
    dispatch
  )

  /**
   * The audio first, then its entry, so an entry always has its audio; an
   * entry that cannot be kept takes the audio back out (`sweepSceneVoice`
   * clears what that misses).
   */
  const save = (effect: Extract<VoiceEffect, { type: "save" }>): void => {
    const id = ports.newId()
    const { take: kept } = effect
    ports.saving(id, true)
    ports.audio.put(id, kept.blob).then(
      () => {
        ports.saving(id, false)
        const listed = ports.notes.add({
          id,
          durationMs: Math.round(kept.durationMs),
          mimeType: kept.mimeType,
        })
        if (!listed) ports.audio.remove([id]).catch(() => undefined)
        dispatch({ type: "saved", outcome: listed ? "kept" : "failed" })
      },
      (error: unknown) => {
        ports.saving(id, false)
        dispatch({
          type: "saved",
          outcome: error instanceof ShelfFullError ? "full" : "failed",
        })
      }
    )
  }

  function run(effect: VoiceEffect): void {
    if (effect.type === "save") save(effect)
    else take.run(effect)
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    start: (): void => {
      if (!snapshot.full) dispatch({ type: "start", atMs: null })
    },
    stop: () => dispatch({ type: "stop" }),
    leave: () => dispatch({ type: "left" }),
    remove: (ids): void => {
      if (!ports.notes.remove(ids)) return
      ports.audio.remove(ids).catch(() => undefined)
      publish()
    },
  }
}
