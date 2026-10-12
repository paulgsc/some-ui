/**
 * The next scene said aloud, on the phone (`./runtime`): the microphone, its
 * audio on a shelf of its own, and the draft's notes in a list. One runtime
 * per page load, so the draft and a take under way outlive the screen that
 * shows them. Phone-only (`build.paths.ts`).
 */
import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"
import type { SceneVoice } from "@some-ui/topik"
import type { BlobShelf } from "@some-ui/voice-capture"
import { blobShelf, micRecorder } from "@some-ui/voice-capture"

import { boundedList } from "@/lib/bounded-list"

import type { StoredNote } from "./runtime"
import { createSceneVoice, SCENE_NOTES_MAX } from "./runtime"

/** A minute a note at the recorder's rate, with room to spare. */
const SCENE_AUDIO_MAX_BYTES = SCENE_NOTES_MAX * 60 * 8000

const isNote = (value: unknown): value is StoredNote =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "id") === "string" &&
  typeof Reflect.get(value, "durationMs") === "number" &&
  typeof Reflect.get(value, "mimeType") === "string"

/** Built at first use, so a build that never records holds nothing of it. */
let list: ReturnType<typeof boundedList<StoredNote>> | null = null
const stored = (): ReturnType<typeof boundedList<StoredNote>> =>
  (list ??= boundedList("some-ui:scene-voice", SCENE_NOTES_MAX, isNote))

/** The draft's notes, oldest first (the list keeps the newest first). */
const notes = {
  read: (): Array<StoredNote> => stored().read().reverse(),
  add: (note: StoredNote): boolean =>
    stored().put(note, ({ id }) => id === note.id),
  remove: (ids: ReadonlyArray<string>): boolean =>
    stored().remove(({ id }) => ids.includes(id)),
}

let shelf: BlobShelf | null = null
/** Notes whose audio is still being written: not yet listed, not orphans. */
const saving = new Set<string>()

/** One shelf per page load, so its database opens once. */
function sceneVoiceAudio(): BlobShelf {
  shelf ??= blobShelf({
    dbName: "some-ui.scene-voice",
    maxBytes: SCENE_AUDIO_MAX_BYTES,
  })
  return shelf
}

let voice: SceneVoice | null = null

export function phoneSceneVoice(): SceneVoice {
  voice ??= createSceneVoice({
    startRecording: micRecorder({ bitsPerSecond: SOUNDBITE_BITS_PER_SECOND }),
    audio: sceneVoiceAudio(),
    notes,
    saving: (id, inFlight) => {
      if (inFlight) saving.add(id)
      else saving.delete(id)
    },
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  })
  return voice
}

/** The draft's audio, by note id, or null for a note whose audio is gone. */
export async function sceneNoteAudio(
  ids: ReadonlyArray<string>
): Promise<Array<Blob | null>> {
  const audio = sceneVoiceAudio()
  return Promise.all(ids.map((id) => audio.get(id)))
}

/**
 * Each half without the other: audio no note names (the app closed between
 * writing it and listing it), and a note whose audio never landed. Best
 * effort, and nothing waits on it.
 */
export function sweepSceneVoice(): void {
  const audio = sceneVoiceAudio()
  audio
    .ids()
    .then(async (stored) => {
      const listed = notes.read().map(({ id }) => id)
      await audio.remove(
        stored.filter((id) => !listed.includes(id) && !saving.has(id))
      )
      const silent = listed.filter((id) => !stored.includes(id))
      if (silent.length > 0) notes.remove(silent)
    })
    .catch(() => undefined)
}
