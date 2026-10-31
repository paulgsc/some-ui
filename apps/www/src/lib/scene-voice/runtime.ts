/**
 * Topik's `SceneVoice` port: `@some-ui/voice-capture`'s voice note, each
 * kept take a note in the draft, its audio on a shelf and its entry in a
 * list, with when it was kept (`at`), which home is told it by (LA13), and
 * whether an ask home holds carried it (`prompted`, LA18).
 *
 * A note goes home once it is kept (LA13), so home can hold one long before
 * its scene is asked for: the draft lets a note go on home's word only once
 * home holds the ask that named it too (`letGo`), or when the person lets it
 * go.
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
  shelveTake,
  takeView,
  voiceNoteRuntime,
  voiceNoteSaid,
} from "@some-ui/voice-capture"

import { SCENE_NOTES_MAX } from "./budget"

/**
 * A note as the phone keeps it: topik's, when it was kept (ISO 8601; a note
 * kept before the phone noted that has none), and whether an ask home holds
 * carried it.
 */
export type KeptSceneNote = SceneNote & {
  readonly at?: string
  readonly prompted?: boolean
}

/** Topik's port, and what the drain tells it. */
export type PhoneSceneVoice = SceneVoice & {
  /** An ask home holds carried these notes (`lib/home-link/going`, LA18). */
  prompted: (ids: ReadonlyArray<string>) => void
}

/** A note is a take of a soundbite's length. */
const LIMITS = { minMs: SOUNDBITE_MIN_MS, maxMs: SOUNDBITE_MAX_MS }

const FULL = `A scene holds ${SCENE_NOTES_MAX} voice notes: let one go to say more.`

export type SceneVoicePorts = {
  startRecording: StartRecording
  audio: BlobShelf
  /** The draft's notes, oldest first. */
  notes: {
    read: () => Array<KeptSceneNote>
    /** Says whether the device stored it. */
    add: (note: KeptSceneNote) => boolean
    remove: (ids: ReadonlyArray<string>) => boolean
    /** Marks these notes carried by an ask home holds; says whether it stored. */
    prompted: (ids: ReadonlyArray<string>) => boolean
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
  const said =
    state.kind !== "blocked" && full ? FULL : voiceNoteSaid(state, quiet)
  return { notes, take: takeView(state), said, full }
}

export function createSceneVoice(ports: SceneVoicePorts): PhoneSceneVoice {
  // Letting notes go hushes the last take's outcome, which was about them.
  let quiet = false
  const listeners = new Set<() => void>()
  const note = voiceNoteRuntime(
    {
      startRecording: ports.startRecording,
      now: ports.now,
      // `sweepSceneVoice` clears what a failed listing leaves.
      save: (take, _atMs, saved) => {
        const id = ports.newId()
        const entry = {
          id,
          durationMs: Math.round(take.durationMs),
          mimeType: take.mimeType,
          at: new Date(ports.now()).toISOString(),
        }
        shelveTake(ports, id, take, () => ports.notes.add(entry), saved)
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

  const remove = (ids: ReadonlyArray<string>): void => {
    if (!ports.notes.remove(ids)) return
    // Ignored: audio no note names is cleared by the next sweep
    // (`sweepSceneVoice`).
    ports.audio.remove(ids).catch(() => undefined)
    quiet = true
    publish()
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
      if (snapshot.full) return
      quiet = false
      note.start(null)
    },
    stop: note.stop,
    leave: note.leave,
    remove,
    prompted(ids): void {
      if (ids.length > 0 && ports.notes.prompted(ids)) publish()
    },
    letGo(homeHolds): void {
      const ids = ports.notes
        .read()
        .filter(({ id, prompted }) => prompted === true && homeHolds.has(id))
        .map(({ id }) => id)
      if (ids.length > 0) remove(ids)
    },
  }
}
