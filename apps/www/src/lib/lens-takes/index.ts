/**
 * The learner's takes of grammar-lens lines, on the phone (`./runtime`,
 * adaptive-learning canon Rem. 4.16): the microphone, the audio on a shelf
 * of its own, and the takes in a list. One runtime per page load. They leave
 * the phone only once the learner says a study-context export carrying them
 * arrived (`letGoLensTakes`).
 * Phone-only (`build.paths.ts`).
 */
import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"
import { audioPlayer, micRecorder, savingShelf } from "@some-ui/voice-capture"

import { boundedList } from "@/lib/bounded-list"

import { LENS_TAKES_MAX, LENS_TAKES_MAX_BYTES } from "./budget"
import type { LensTake, PhoneLensTakes } from "./runtime"
import { createLensTakes } from "./runtime"

export type { LensTake } from "./runtime"

const isTake = (value: unknown): value is LensTake =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "id") === "string" &&
  typeof Reflect.get(value, "line") === "string" &&
  typeof Reflect.get(value, "takenAt") === "number" &&
  typeof Reflect.get(value, "durationMs") === "number" &&
  typeof Reflect.get(value, "mimeType") === "string"

const list = boundedList("some-ui:lens-takes", LENS_TAKES_MAX, isTake)

const takes = {
  read: list.read,
  add: (take: LensTake): boolean => list.put(take, ({ id }) => id === take.id),
  remove: (ids: ReadonlyArray<string>): boolean =>
    list.remove(({ id }) => ids.includes(id)),
}

const shelf = savingShelf({
  dbName: "some-ui.lens-takes",
  maxBytes: LENS_TAKES_MAX_BYTES,
})

let runtime: PhoneLensTakes | null = null

export function phoneLensTakes(): PhoneLensTakes {
  runtime ??= createLensTakes({
    startRecording: micRecorder({ bitsPerSecond: SOUNDBITE_BITS_PER_SECOND }),
    audio: shelf.shelf(),
    takes,
    saving: shelf.saving,
    player: audioPlayer,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  })
  return runtime
}

/**
 * Each half without the other: audio no take names (the app closed between
 * writing it and listing it), and a take whose audio never landed. Best
 * effort, and nothing waits on it.
 */
export function sweepLensTakes(): void {
  const audio = shelf.shelf()
  // Listed first: a take that lands meanwhile is then neither listed here
  // nor silent.
  const listed = takes.read()
  audio
    .ids()
    .then(async (stored) => {
      const silent = listed
        .filter(({ id }) => !stored.includes(id))
        .map(({ id }) => id)
      // Through the runtime, so a screen showing the takes sees them go.
      if (silent.length > 0) phoneLensTakes().letGo(silent)
      const kept = takes.read().map(({ id }) => id)
      await audio.remove(
        stored.filter((id) => !kept.includes(id) && !shelf.isSaving(id))
      )
    })
    .catch(() => undefined)
}

/**
 * The takes as kept, newest first, each with its audio: null when it is gone,
 * and `read` false when the shelf could not be read, so that take, whose
 * audio may still be there, is not let go with the export.
 */
export async function lensTakesForExport(): Promise<
  Array<{ take: LensTake; audio: Blob | null; read: boolean }>
> {
  const audio = shelf.shelf()
  return Promise.all(
    takes.read().map(async (take) => {
      try {
        return { take, audio: await audio.get(take.id), read: true }
      } catch {
        return { take, audio: null, read: false }
      }
    })
  )
}

/**
 * The learner says an export carrying `ids` arrived: those takes leave the
 * phone, through the runtime so a screen showing one sees it go.
 */
export function letGoLensTakes(ids: ReadonlyArray<string>): void {
  phoneLensTakes().letGo(ids)
}
