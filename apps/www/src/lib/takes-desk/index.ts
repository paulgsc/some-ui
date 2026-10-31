/**
 * A desk of takes on the phone (`./runtime`): the microphone, the audio on a
 * shelf of its own, and the takes in a list, one runtime per page load.
 * They leave the phone only once the learner says a study-context export
 * carrying them arrived (`letGo`). Grammar-lens takes (`lib/lens-takes`) and
 * LeetType's spoken answers (`lib/leetype-takes`) each keep one.
 * Phone-only (`build.paths.ts`).
 */
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"
import { audioPlayer, micRecorder, savingShelf } from "@some-ui/voice-capture"

import { boundedList } from "@/lib/bounded-list"

import type { PhoneTakes, Take, TakeLimits } from "./runtime"
import { createTakes } from "./runtime"

export type { DeskSnapshot, Take } from "./runtime"

const isTake = (value: unknown): value is Take =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "id") === "string" &&
  typeof Reflect.get(value, "line") === "string" &&
  typeof Reflect.get(value, "takenAt") === "number" &&
  typeof Reflect.get(value, "durationMs") === "number" &&
  typeof Reflect.get(value, "mimeType") === "string"

export type TakesDesk = {
  readonly phone: () => PhoneTakes
  /**
   * Each half without the other: audio no take names (the app closed
   * between writing it and listing it), and a take whose audio never
   * landed. Best effort, and nothing waits on it.
   */
  readonly sweep: () => void
  /**
   * The takes as kept, newest first, each with its audio: null when it is
   * gone, and `read` false when the shelf could not be read, so that take,
   * whose audio may still be there, is not let go with the export.
   */
  readonly forExport: () => Promise<
    Array<{ take: Take; audio: Blob | null; read: boolean }>
  >
  /**
   * The take kept on `line` at or after `since` (ms since the epoch), the
   * earliest such; null when this phone holds none.
   */
  readonly keptOn: (line: string, since: number) => string | null
  /**
   * The learner says an export carrying `ids` arrived: those takes leave the
   * phone, through the runtime so a screen showing one sees it go.
   */
  readonly letGo: (ids: ReadonlyArray<string>) => void
}

/** The shelf's own cap: a full desk of full-length takes at the soundbites' bitrate. */
function maxBytes(limits: TakeLimits): number {
  return limits.max * (limits.maxMs / 1000) * (SOUNDBITE_BITS_PER_SECOND / 8)
}

export function takesDesk(options: {
  /** The list's `localStorage` key and the shelf's database. */
  readonly key: string
  readonly dbName: string
  readonly limits: TakeLimits
}): TakesDesk {
  const list = boundedList(options.key, options.limits.max, isTake)
  const takes = {
    read: list.read,
    add: (take: Take): boolean => list.put(take, ({ id }) => id === take.id),
    remove: (ids: ReadonlyArray<string>): boolean =>
      list.remove(({ id }) => ids.includes(id)),
  }
  // Nothing keeps it free; the device's measured budget (`withRoom`) still
  // refuses a take the phone has no room for.
  const shelf = savingShelf({
    dbName: options.dbName,
    maxBytes: maxBytes(options.limits),
  })

  let runtime: PhoneTakes | null = null
  const phone = (): PhoneTakes => {
    runtime ??= createTakes(
      {
        startRecording: micRecorder({
          bitsPerSecond: SOUNDBITE_BITS_PER_SECOND,
        }),
        audio: shelf.shelf(),
        takes,
        saving: shelf.saving,
        player: audioPlayer,
        now: () => Date.now(),
        newId: () => crypto.randomUUID(),
      },
      options.limits
    )
    return runtime
  }

  return {
    phone,
    sweep: (): void => {
      const audio = shelf.shelf()
      // Listed first: a take that lands meanwhile is then neither listed
      // here nor silent.
      const listed = takes.read()
      audio
        .ids()
        .then(async (stored) => {
          const silent = listed
            .filter(({ id }) => !stored.includes(id))
            .map(({ id }) => id)
          // Through the runtime, so a screen showing the takes sees them go.
          if (silent.length > 0) phone().letGo(silent)
          const kept = takes.read().map(({ id }) => id)
          await audio.remove(
            stored.filter((id) => !kept.includes(id) && !shelf.isSaving(id))
          )
        })
        .catch((error: unknown) => {
          reportFailure({
            port: "takes desk sweep",
            error: toIntentError(error),
          })
        })
    },
    forExport: (): ReturnType<TakesDesk["forExport"]> => {
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
    },
    keptOn: (line, since): string | null =>
      takes
        .read()
        .filter((take) => take.line === line && take.takenAt >= since)
        .sort((a, b) => a.takenAt - b.takenAt)[0]?.id ?? null,
    letGo: (ids): void => {
      phone().letGo(ids)
    },
  }
}
