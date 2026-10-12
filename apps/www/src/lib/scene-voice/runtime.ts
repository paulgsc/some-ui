/**
 * Topik's `SceneVoice` port: `@some-ui/voice-capture`'s voice note, each
 * kept take a note in the draft, its audio on a shelf and its entry in a
 * list.
 */
import {
  SOUNDBITE_MAX_MS,
  SOUNDBITE_MIN_MS,
} from "@some-ui/soundbites/contract"
import type { SceneNote, SceneVoice, SceneVoiceSnapshot } from "@some-ui/topik"
import type {
  BlobShelf,
  StartRecording,
  VoiceNoteState,
} from "@some-ui/voice-capture"
import {
  RECORDING_FAILURE_COPY,
  ShelfFullError,
  VOICE_NOTE_SAID,
  voiceNoteRuntime,
} from "@some-ui/voice-capture"

import { SCENE_NOTES_MAX } from "./budget"

/** A note is a take of a soundbite's length. */
const LIMITS = { minMs: SOUNDBITE_MIN_MS, maxMs: SOUNDBITE_MAX_MS }

const FULL = `A scene holds ${SCENE_NOTES_MAX} voice notes: let one go to say more.`

export type SceneVoicePorts = {
  startRecording: StartRecording
  audio: BlobShelf
  /** The draft's notes, oldest first. */
  notes: {
    read: () => Array<SceneNote>
    /** Says whether the device stored it. */
    add: (note: SceneNote) => boolean
    remove: (ids: ReadonlyArray<string>) => boolean
  }
  /** A note whose audio is being written, and when done. */
  saving: (id: string, inFlight: boolean) => void
  now: () => number
  newId: () => string
}

function snapshotOf(
  state: VoiceNoteState,
  notes: ReadonlyArray<SceneNote>,
  quiet: boolean
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
      : full
        ? FULL
        : state.kind === "idle" && state.last !== null && !quiet
          ? VOICE_NOTE_SAID[state.last]
          : null
  return { notes, take, said, full }
}

export function createSceneVoice(ports: SceneVoicePorts): SceneVoice {
  // Letting notes go hushes the last take's outcome, which was about them.
  let quiet = false
  const listeners = new Set<() => void>()
  const note = voiceNoteRuntime(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      /**
       * The audio first, then its entry, so an entry always has its audio;
       * an entry that cannot be kept takes the audio back out
       * (`sweepSceneVoice` clears what that misses).
       */
      save: (take, _atMs, saved) => {
        const id = ports.newId()
        ports.saving(id, true)
        ports.audio.put(id, take.blob).then(
          () => {
            ports.saving(id, false)
            const listed = ports.notes.add({
              id,
              durationMs: Math.round(take.durationMs),
              mimeType: take.mimeType,
            })
            if (!listed) ports.audio.remove([id]).catch(() => undefined)
            saved(listed ? "kept" : "failed")
          },
          (error: unknown) => {
            ports.saving(id, false)
            saved(error instanceof ShelfFullError ? "full" : "failed")
          }
        )
      },
    },
    LIMITS
  )
  let snapshot = snapshotOf(note.getSnapshot(), ports.notes.read(), quiet)
  const publish = (): void => {
    snapshot = snapshotOf(note.getSnapshot(), ports.notes.read(), quiet)
    for (const listener of listeners) listener()
  }
  note.subscribe(publish)

  return {
    getSnapshot: () => snapshot,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    start: (): void => {
      if (snapshot.full) return
      quiet = false
      note.start(null)
    },
    stop: note.stop,
    leave: note.leave,
    remove: (ids): void => {
      if (!ports.notes.remove(ids)) return
      ports.audio.remove(ids).catch(() => undefined)
      quiet = true
      publish()
    },
  }
}
