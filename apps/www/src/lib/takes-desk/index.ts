/**
 * A desk of takes on the phone: the audio on a shelf of its own and the
 * takes in a list, one runtime per page load. Two runtimes sit on it:
 *
 * - `takesDesk`: the take kit's (`./runtime`), the grammar lens's port
 *   (`lib/lens-takes`), until the lens moves to the take pattern (MIC5).
 * - `patternDesk`: the take pattern's (`./pattern`), with Redo and Let go:
 *   Rust Rounds' notes (`lib/rust-rounds`) and LeetType's spoken answers
 *   (`lib/leetype-takes`).
 *
 * Each take goes home as a voice note (`lib/home-link/voice-copy`, HF5
 * #2180), which tells the desk what home holds (`heldByHome`). Phone-only
 * (`build.paths.ts`).
 */
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import { SOUNDBITE_BITS_PER_SECOND } from "@some-ui/soundbites/contract"
import type { Player } from "@some-ui/voice-capture"
import { audioPlayer, micRecorder, savingShelf } from "@some-ui/voice-capture"

import { boundedList } from "@/lib/bounded-list"

import type { PatternPhone, PatternTakesPorts } from "./pattern"
import { createPatternTakes } from "./pattern"
import type { PhoneTakes, Take, TakeLimits } from "./runtime"
import { createTakes } from "./runtime"

export type { Take } from "./runtime"
export { makesRoom } from "./runtime"

const STANDINGS: ReadonlyArray<unknown> = [undefined, "earlier", "set-aside"]

const isTake = (value: unknown): value is Take =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "id") === "string" &&
  typeof Reflect.get(value, "line") === "string" &&
  typeof Reflect.get(value, "takenAt") === "number" &&
  typeof Reflect.get(value, "durationMs") === "number" &&
  typeof Reflect.get(value, "mimeType") === "string" &&
  STANDINGS.includes(Reflect.get(value, "standing"))

/** What either desk offers besides its runtime. */
type DeskShelf = {
  /**
   * Each half without the other: audio no take names (the app closed
   * between writing it and listing it), and a take whose audio never
   * landed. Best effort, and nothing waits on it.
   */
  readonly sweep: () => void
  /**
   * The takes as kept, newest first, each with its audio: null when it is
   * gone, and `read` false when the shelf could not be read, so that take,
   * whose audio may still be there, is not counted as gone with the export.
   */
  readonly forExport: () => Promise<
    Array<{ take: Take; audio: Blob | null; read: boolean }>
  >
  /**
   * The take kept on `line` at or after `since` (ms since the epoch), the
   * earliest such; null when this phone holds none.
   */
  readonly keptOn: (line: string, since: number) => string | null
  /** The takes as kept, newest first, for the copy home. */
  readonly kept: () => ReadonlyArray<Take>
  /** A take's audio, or null when it is gone. */
  readonly audio: (id: string) => Promise<Blob | null>
  /**
   * What home holds of the takes, read back, from the voice notes' lane
   * (`lib/home-link/voice-copy`): those may make room for a new take.
   */
  readonly heldByHome: (held: (id: string) => boolean) => void
}

export type TakesDesk = DeskShelf & { readonly phone: () => PhoneTakes }

export type PatternDesk = DeskShelf & { readonly phone: () => PatternPhone }

type DeskOptions = {
  /** The list's `localStorage` key and the shelf's database. */
  readonly key: string
  readonly dbName: string
  readonly limits: TakeLimits
}

/** The shelf's own cap: a full desk of full-length takes at the soundbites' bitrate. */
function maxBytes(limits: TakeLimits): number {
  return limits.max * (limits.maxMs / 1000) * (SOUNDBITE_BITS_PER_SECOND / 8)
}

/** What a runtime needs of the desk, and what it gives back. */
type Runtime = {
  readonly letGo: (ids: ReadonlyArray<string>) => void
  readonly recount: () => void
}

function desk<R extends Runtime>(
  options: DeskOptions,
  make: (ports: PatternTakesPorts & { readonly player: Player }) => R
): DeskShelf & { readonly phone: () => R } {
  const list = boundedList(options.key, options.limits.max, isTake)
  const takes: PatternTakesPorts["takes"] = {
    read: list.read,
    add: (take, supersedes): boolean =>
      list.put(
        take,
        ({ id }) => id === take.id,
        (other) =>
          other.id === supersedes ? { ...other, standing: "earlier" } : other
      ),
    remove: (ids): boolean => list.remove(({ id }) => ids.includes(id)),
    setAside: (id): boolean =>
      list.update((take) =>
        take.id === id ? { ...take, standing: "set-aside" } : take
      ),
  }
  // Nothing keeps it free; the device's measured budget (`withRoom`) still
  // refuses a take the phone has no room for.
  const shelf = savingShelf({
    dbName: options.dbName,
    maxBytes: maxBytes(options.limits),
  })

  // Home holds none until the voice notes' lane says otherwise.
  let held: (id: string) => boolean = () => false
  let runtime: R | null = null
  const phone = (): R => {
    runtime ??= make({
      startRecording: micRecorder({
        bitsPerSecond: SOUNDBITE_BITS_PER_SECOND,
      }),
      audio: shelf.shelf(),
      takes,
      saving: shelf.saving,
      player: audioPlayer,
      now: () => Date.now(),
      newId: () => crypto.randomUUID(),
      held: (id) => held(id),
    })
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
    forExport: (): ReturnType<DeskShelf["forExport"]> => {
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
    kept: takes.read,
    audio: (id) => shelf.shelf().get(id),
    heldByHome: (next): void => {
      held = next
      runtime?.recount()
    },
  }
}

/** The lens's desk, on the take kit (`./runtime`). */
export function takesDesk(options: DeskOptions): TakesDesk {
  return desk(options, (ports) => createTakes(ports, options.limits))
}

/** A desk on the take pattern (`./pattern`): Redo and Let go. */
export function patternDesk(options: DeskOptions): PatternDesk {
  return desk(options, (ports) => createPatternTakes(ports, options.limits))
}
