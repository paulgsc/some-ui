/**
 * What Practice's lane (`./practice`, LA15) last read of the two records HF5
 * added to the drain whose stores it cannot read at once: the soundbites'
 * records (their IndexedDB answers only asynchronously, and only once their
 * page has handed their store in, `lib/soundbite-keeping`) and the
 * grammar-lens record (topik's, loaded only once the phone is paired, as
 * `./voice-copy`'s reading of what home holds is). Each change to either
 * store is read here first, so the lane's revision and waiting count can
 * follow it. LeetType's answer notes need no read here: they are read as
 * they are (`lib/leetype-takes`).
 *
 * Reads only this phone; sends nothing and lets nothing go.
 */
import { fnv1a } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { Soundbite } from "@some-ui/soundbites"

import { onSoundbitesKept, soundbiteKeeping } from "@/lib/soundbite-keeping"

import { homeLink, paired } from "./index"
import type { LensEntry } from "./lens-record"
import { lensDigest, lensKey } from "./lens-record"

export type PracticeRead = {
  /** The soundbites as last listed; none until their store is handed in and read. */
  readonly bites: ReadonlyArray<Soundbite>
  /** The lens record's entries as last read; none until topik is loaded. */
  readonly lens: ReadonlyArray<LensEntry>
  /** Each of `lens` as it is now (`lensDigest`), as one number. */
  readonly lensAsIs: number
}

/** What `lensAsIs` is for `entries`; an unread record reads as an empty one. */
const asIs = (entries: ReadonlyArray<LensEntry>): number =>
  fnv1a(entries.map((e) => `${lensKey(e)}@${lensDigest(e)}`).join("|"))

const UNREAD: PracticeRead = { bites: [], lens: [], lensAsIs: asIs([]) }

let read: PracticeRead = UNREAD
const listeners = new Set<() => void>()

function moved(next: PracticeRead): void {
  read = next
  for (const listener of listeners) listener()
}

/** For `useSyncExternalStore`: the same snapshot until a read finds another. */
export const practiceRead = {
  getSnapshot: (): PracticeRead => read,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return (): void => {
      listeners.delete(listener)
    }
  },
}

/** The lens record could not be loaded, to the native log. */
function lensUnread(error: unknown): void {
  reportFailure({
    port: "grammar-lens record (watch for home)",
    error: {
      ...toIntentError(error),
      summary: "The grammar-lens record couldn't be watched for home.",
    },
  })
}

/**
 * Reads each store on every change to it, until the returned stop: the
 * soundbites once their page hands their store in, and the lens record once
 * the phone is paired.
 */
export function watchPracticeStores(): () => void {
  let live = true
  const stops: Array<() => void> = []

  // The newest list asked for wins: an earlier one landing late is dropped.
  let bitesAsked = 0
  const readBites = (): void => {
    const kept = soundbiteKeeping()
    if (kept === null) return
    bitesAsked += 1
    const asked = bitesAsked
    kept.store.list().then(
      (bites) => {
        if (live && asked === bitesAsked) moved({ ...read, bites })
      },
      () => {
        // Ignored: the voice lane reports a store it can't list
        // (`./voice-copy`), and the drain's own read carries none of it.
      }
    )
  }
  let bitesHeard = false
  const handed = (): void => {
    const kept = soundbiteKeeping()
    if (kept === null || bitesHeard) return
    bitesHeard = true
    stops.push(kept.store.subscribe(readBites))
    readBites()
  }

  let lensAsked = false
  const lens = (): void => {
    if (lensAsked || !paired()) return
    lensAsked = true
    import("@some-ui/topik").then(
      ({ lensRecordForExport, onLensRecordWritten }) => {
        if (!live) return
        const readLens = (): void => {
          try {
            const { entries } = lensRecordForExport()
            moved({ ...read, lens: entries, lensAsIs: asIs(entries) })
          } catch (error) {
            lensUnread(error)
          }
        }
        stops.push(onLensRecordWritten(readLens))
        readLens()
      },
      (error: unknown) => {
        lensAsked = false
        lensUnread(error)
      }
    )
  }

  handed()
  lens()
  stops.push(onSoundbitesKept(handed), homeLink().subscribe(lens))
  return (): void => {
    live = false
    for (const stop of stops) stop()
  }
}
