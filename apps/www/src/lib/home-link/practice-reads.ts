/**
 * What Practice's lane (`./practice`, LA15) last read of the records in its
 * drain whose stores it cannot read at once: the soundbites' records (their
 * IndexedDB answers only asynchronously, and only once their page has handed
 * their store in, `lib/soundbite-keeping`), the grammar-lens record (topik's,
 * loaded only once the phone is paired, as `./voice-copy`'s reading of what
 * home holds is), LeetType's finished sessions (`@some-ui/leetype`'s log,
 * loaded the same way, read again on each event that can finish a session,
 * #2425) and Studio's answers to how a sitting went (its projects, read only
 * asynchronously, once Studio's route has handed them in, #2425). Each change
 * to any of them is read here first, so the lane's revision and waiting count
 * can follow it. LeetType's answer notes need no read here: they are read as
 * they are (`lib/leetype-takes`). Nor does Studio's time log, which is read
 * as it is where it is counted.
 *
 * Reads only this phone; sends nothing and lets nothing go.
 */
import { fnv1a } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import type { HomeSession, SessionEvent } from "@some-ui/leetype"
import type { Soundbite } from "@some-ui/soundbites"

import { onSoundbitesKept, soundbiteKeeping } from "@/lib/soundbite-keeping"
import { onStudioKept, studioKeeping } from "@/lib/studio-keeping"

import { homeLink, paired } from "./index"
import type { LensEntry } from "./lens-record"
import { lensDigest, lensKey } from "./lens-record"
import { digestOf } from "./sent"
import type { StudioReport } from "./studio-log"
import { reportsOf } from "./studio-log"

export type PracticeRead = {
  /** The soundbites as last listed; none until their store is handed in and read. */
  readonly bites: ReadonlyArray<Soundbite>
  /** The lens record's entries as last read; none until topik is loaded. */
  readonly lens: ReadonlyArray<LensEntry>
  /** Each of `lens` as it is now (`lensDigest`), as one number. */
  readonly lensAsIs: number
  /** LeetType's finished sessions as last read; none until its log is loaded. */
  readonly leetype: ReadonlyArray<HomeSession>
  /** Each of `leetype` as it is now (`digestOf`), as one number. */
  readonly leetypeAsIs: number
  /** Studio's answers to how a sitting went; none until Studio is handed in and read. */
  readonly studioReports: ReadonlyArray<StudioReport>
}

/** What `lensAsIs` is for `entries`; an unread record reads as an empty one. */
const asIs = (entries: ReadonlyArray<LensEntry>): number =>
  fnv1a(entries.map((e) => `${lensKey(e)}@${lensDigest(e)}`).join("|"))

/** What `leetypeAsIs` is for `sessions`. */
const sessionsAsIs = (sessions: ReadonlyArray<HomeSession>): number =>
  fnv1a(sessions.map((s) => `${s.session}@${digestOf(s)}`).join("|"))

const UNREAD: PracticeRead = {
  bites: [],
  lens: [],
  lensAsIs: asIs([]),
  leetype: [],
  leetypeAsIs: sessionsAsIs([]),
  studioReports: [],
}

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

/** LeetType's session log could not be loaded, to the native log. */
function logUnread(error: unknown): void {
  reportFailure({
    port: "LeetType session log (watch for home)",
    error: {
      ...toIntentError(error),
      summary: "LeetType's session log couldn't be watched for home.",
    },
  })
}

/**
 * Reads each store on every change to it, until the returned stop: the
 * soundbites once their page hands their store in, Studio's answers once its
 * route hands its projects in, and the lens record and LeetType's session
 * log once the phone is paired. The log is read again only on an event that
 * can finish a session (a start or an end) or one in a session already
 * finished, so a step of a session under way costs nothing here.
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

  let logAsked = false
  const log = (): void => {
    if (logAsked || !paired()) return
    logAsked = true
    import("@some-ui/leetype").then(
      ({ createSessionLogStore, finishedSessions, onSessionLogged }) => {
        if (!live) return
        let finished = new Set<string>()
        const readLog = (): void => {
          const store = createSessionLogStore()
          const sessions = store.readOnly
            ? []
            : finishedSessions(store.getSnapshot().log)
          finished = new Set(sessions.map((s) => s.session))
          moved({
            ...read,
            leetype: sessions,
            leetypeAsIs: sessionsAsIs(sessions),
          })
        }
        const finishes = (event: SessionEvent): boolean =>
          event.type === "started" ||
          event.type === "ended" ||
          finished.has(event.session)
        stops.push(
          onSessionLogged((event) => {
            if (finishes(event)) readLog()
          })
        )
        readLog()
      },
      (error: unknown) => {
        logAsked = false
        logUnread(error)
      }
    )
  }

  // The newest read asked for wins: an earlier one landing late is dropped.
  let studioAsked = 0
  const readStudio = (): void => {
    const studio = studioKeeping()
    if (studio === null) return
    studioAsked += 1
    const asked = studioAsked
    Promise.all([studio.store.list(), studio.store.friction()]).then(
      ([projects, friction]) => {
        if (!live || asked !== studioAsked) return
        moved({
          ...read,
          studioReports: reportsOf(friction, projects, studio.sittingKey),
        })
      },
      () => {
        // Ignored: the drain's own read (`./going`'s `studioGoing`) meets
        // the same store, and this count then says what was read last.
      }
    )
  }
  let studioHeard = false
  const studioHanded = (): void => {
    const studio = studioKeeping()
    if (studio === null || studioHeard) return
    studioHeard = true
    stops.push(studio.store.subscribe(readStudio))
    readStudio()
  }

  const onLink = (): void => {
    lens()
    log()
  }

  handed()
  studioHanded()
  onLink()
  stops.push(
    onSoundbitesKept(handed),
    onStudioKept(studioHanded),
    homeLink().subscribe(onLink)
  )
  return (): void => {
    live = false
    for (const stop of stops) stop()
  }
}
