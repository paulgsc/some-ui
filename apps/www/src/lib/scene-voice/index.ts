/**
 * The next scene said aloud, on the phone (`./runtime`, on the take
 * pattern): the microphone, its audio on a shelf of its own, and the draft's
 * notes in a list, those set aside or recorded again among them until home
 * holds them. One runtime per page load, so the draft and a take under way
 * outlive the screen that shows them. Phone-only (`build.paths.ts`).
 */
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"
import type { TakeKept } from "@some-ui/voice-capture"
import { micRecorder, ON_PHONE, savingShelf } from "@some-ui/voice-capture"

import { boundedList } from "@/lib/bounded-list"
import { NONE_MARKED } from "@/lib/takes-desk/runtime"

import { SCENE_AUDIO_MAX_BYTES, SCENE_NOTES_KEPT } from "./budget"
import type { KeptSceneNote, PhoneSceneVoice, SceneVoicePorts } from "./runtime"
import { createSceneVoice, sweepNotes } from "./runtime"

export type { KeptSceneNote } from "./runtime"

const STANDINGS: ReadonlyArray<unknown> = [undefined, "earlier", "set-aside"]

const isNote = (value: unknown): value is KeptSceneNote =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "id") === "string" &&
  typeof Reflect.get(value, "durationMs") === "number" &&
  typeof Reflect.get(value, "mimeType") === "string" &&
  ["string", "undefined"].includes(typeof Reflect.get(value, "at")) &&
  ["boolean", "undefined"].includes(typeof Reflect.get(value, "prompted")) &&
  STANDINGS.includes(Reflect.get(value, "standing")) &&
  ["string", "undefined"].includes(typeof Reflect.get(value, "setAsideAt"))

const list = boundedList("some-ui:scene-voice", SCENE_NOTES_KEPT, isNote)

/** The notes, oldest first (the list keeps the newest first). */
const notes: SceneVoicePorts["notes"] = {
  read: (): Array<KeptSceneNote> => list.read().reverse(),
  add: (note, supersedes): boolean =>
    list.put(
      note,
      ({ id }) => id === note.id,
      (other) =>
        other.id === supersedes ? { ...other, standing: "earlier" } : other
    ),
  remove: (ids): boolean => list.remove(({ id }) => ids.includes(id)),
  prompted: (ids): boolean =>
    list.update((note) =>
      ids.includes(note.id) ? { ...note, prompted: true } : note
    ),
  setAside: (ids, at): boolean =>
    list.update((note) =>
      ids.includes(note.id) && note.standing !== "set-aside"
        ? { ...note, standing: "set-aside", setAsideAt: at }
        : note
    ),
}

const shelf = savingShelf({
  dbName: "some-ui.scene-voice",
  maxBytes: SCENE_AUDIO_MAX_BYTES,
})

let voice: PhoneSceneVoice | null = null
// On this phone until the voice lane says otherwise.
let where: (id: string) => TakeKept = () => ON_PHONE
let marked: (id: string) => boolean = NONE_MARKED

/**
 * Where each note is kept, from the voice lane (`lib/home-link/voice-copy`,
 * MIC3): what each row says; and which set-aside marks are safe, without
 * which a note set aside never leaves (LA13). Builds no runtime that is not
 * there yet.
 */
export function sceneNotesKept(
  next: (id: string) => TakeKept,
  safe: (id: string) => boolean = NONE_MARKED
): void {
  where = next
  marked = safe
  voice?.recount()
}

export function phoneSceneVoice(): PhoneSceneVoice {
  voice ??= createSceneVoice({
    startRecording: micRecorder({ bitsPerSecond: SOUNDBITE_BITS_PER_SECOND }),
    audio: shelf.shelf(),
    notes,
    saving: shelf.saving,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    kept: (id) => where(id),
    marked: (id) => marked(id),
  })
  return voice
}

/**
 * Each half without the other (`sweepNotes`, SV1): audio no note names (the
 * app closed between writing it and listing it), and a note whose audio
 * never landed, let go through the runtime so a screen showing the draft
 * sees it go. Best effort, and nothing waits on it.
 */
export function sweepSceneVoice(): void {
  sweepNotes({
    notes,
    audio: shelf.shelf(),
    isSaving: shelf.isSaving,
    remove: (ids) => phoneSceneVoice().remove(ids),
  }).catch((error: unknown) => {
    reportFailure({ port: "scene voice sweep", error: toIntentError(error) })
  })
}

/**
 * The notes as the phone keeps them, oldest first, those out of the draft
 * among them, and each one's audio, for the voice lane
 * (`lib/home-link/voice-copy`, LA13). A note is listed only once its audio
 * is on the shelf.
 */
export const sceneNotes = {
  read: notes.read,
  audio: (id: string): Promise<Blob | null> => shelf.shelf().get(id),
}
