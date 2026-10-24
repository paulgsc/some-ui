/**
 * The runtime behind `./routine-model`: Korean's look at what the
 * reflections routine left on the paired home (`GET /routine/files`,
 * paulgsc/server `handlers/routine.rs`), through the link's `keep`, once
 * its person chose to show it (LA12, docs/learner-data-authority.md).
 *
 * - **Only once shown, only under the pairing it was shown for, only in
 *   front.** `list` sends nothing unless the choice log shows the files
 *   under the pairing this phone holds and the app is visible; otherwise it
 *   answers with what it last read under that choice, or no files.
 * - **One read at a time:** a call while one is on its way shares it.
 * - **Never rejects, never retries.** The app's query retries a rejection,
 *   and LA8 allows no retry, so every way a read ends resolves: a refusal,
 *   home's silence or a fault on this phone is said in `last`, and the
 *   answer is the last one read under the same choice.
 * - **Nothing outlives its choice.** An answer that lands once its choice
 *   is stopped, or its pairing gone, is dropped; a stop, an unpairing or a
 *   new pairing clears what was held. Home's files are held in memory only.
 * - **An unreadable choice log is never written over,** as the consent
 *   log's is not (`./consent-runtime`): every choice is then refused, and
 *   nothing is shown until it can be read.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { localStorageOrNull } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import { ForeignCallError } from "@/lib/intent/foreign"

import { homeLink } from "./index"
import type { ReadEvent, ReadLog, ReadState, Under } from "./routine-model"
import {
  appendedRead,
  heldFor,
  INITIAL_READ,
  mayRead,
  parseReadLog,
  sameUnder,
  stepRead,
  underNow,
} from "./routine-model"
import type { HomeLink } from "./runtime"
import { unanswered } from "./runtime"

export const READS_KEY = "some-ui.home.reads.v1"

/** What `list` answers when nothing was read under the choice shown now. */
const NO_FILES = { files: [] } as const

export type RoutinePorts = {
  keep: HomeLink["keep"]
  /** The id of the pairing this phone holds, or null. */
  pairing: () => string | null
  /** The app is in front. */
  visible: () => boolean
  now: () => number
  storage: Pick<Storage, "getItem" | "setItem"> | null
  /** Calls `listener` when the link changes (an unpairing, a new pairing). */
  onLink: (listener: () => void) => () => void
}

type RoutineSnapshot = {
  readonly log: ReadLog
  readonly read: ReadState
}

export type RoutineReads = {
  getSnapshot: () => RoutineSnapshot
  subscribe: (listener: () => void) => () => void
  /** Home's answer, as it came (topik parses it); never rejects. */
  list: () => Promise<unknown>
  /**
   * Shows or hides the routine's files under the pairing this phone holds,
   * with `said` the words pressed. False when the phone would not keep it.
   */
  choose: (kind: "shown" | "hidden", said: string) => boolean
}

type Ended = Extract<ReadEvent, { type: "ended" }>["kind"]

/** What a read's answer says: home's files, or how it ended without them. */
function answerOf(answer: HomeAnswer): { files: unknown } | { ended: Ended } {
  if (answer.status === 401) return { ended: "forgotten" }
  if (answer.status === 429) return { ended: "busy" }
  if (answer.status !== 200) return { ended: "failed" }
  try {
    const files: unknown = JSON.parse(answer.body)
    return { files }
  } catch {
    return { ended: "failed" }
  }
}

export function createRoutineReads(ports: RoutinePorts): RoutineReads {
  let log: ReadLog = []
  let readable = ports.storage !== null
  try {
    const text = ports.storage?.getItem(READS_KEY) ?? null
    const read = text === null ? [] : parseReadLog(text)
    if (read === null) readable = false
    else log = read
  } catch {
    readable = false
  }
  let snapshot: RoutineSnapshot = { log, read: INITIAL_READ }
  const listeners = new Set<() => void>()
  const changed = (next: RoutineSnapshot): void => {
    if (next.log === snapshot.log && next.read === snapshot.read) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  const dispatch = (event: ReadEvent): void =>
    changed({ log, read: stepRead(snapshot.read, event) })

  const underNowHere = (): Under | null => underNow(log, ports.pairing())

  // The choice what is held was read under; cleared once it is not the one
  // shown now.
  let heldUnder: Under | null = null
  const settle = (): void => {
    if (heldUnder === null || sameUnder(heldUnder, underNowHere())) return
    heldUnder = null
    dispatch({ type: "cleared" })
  }
  ports.onLink(settle)

  const heldNow = (): unknown =>
    heldFor(snapshot.read, underNowHere()) ?? NO_FILES

  // A read that ended without files, said for the choice it was made
  // under; dropped once that choice is not the one shown now.
  const end = (under: Under, kind: Ended): unknown => {
    if (sameUnder(under, underNowHere())) {
      dispatch({ type: "ended", kind, at: ports.now() })
    } else {
      dispatch({ type: "dropped" })
      settle()
    }
    return heldNow()
  }

  const readUnder = async (under: Under): Promise<unknown> => {
    let outcome: Awaited<ReturnType<typeof ports.keep<HomeAnswer>>>
    try {
      outcome = await ports.keep((send) => send("GET", "/routine/files"))
    } catch (error) {
      if (unanswered(error)) return end(under, "unreachable")
      // A fault on this phone, not home's silence: it goes to the native
      // log (once: a foreign call's own port has already reported it).
      if (!(error instanceof ForeignCallError)) {
        reportFailure({
          port: "home server (routine)",
          error: {
            ...toIntentError(error),
            summary: "Something on this phone went wrong.",
          },
        })
      }
      return end(under, "failed")
    }
    if (outcome === null) {
      // Turned away: the link was doing something else, or the phone is no
      // longer paired, which `settle` clears.
      if (ports.pairing() === null) {
        dispatch({ type: "dropped" })
        return heldNow()
      }
      return end(under, "busy")
    }
    if (outcome.kind === "stopped") {
      dispatch({ type: "dropped" })
      return heldNow()
    }
    const read = answerOf(outcome.value)
    if ("ended" in read) return end(under, read.ended)
    // Landed after a stop, an unpairing or a new pairing: nothing of it is kept.
    if (!sameUnder(under, underNowHere())) {
      dispatch({ type: "dropped" })
      settle()
      return heldNow()
    }
    heldUnder = under
    dispatch({ type: "answered", under, files: read.files, at: ports.now() })
    return read.files
  }

  let inFlight: Promise<unknown> | null = null

  return {
    getSnapshot: () => snapshot,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    list(): Promise<unknown> {
      settle()
      if (inFlight !== null) return inFlight
      const under = underNowHere()
      if (under === null) return Promise.resolve(NO_FILES)
      if (!mayRead(snapshot.read, { under, visible: ports.visible() })) {
        return Promise.resolve(heldNow())
      }
      heldUnder ??= under
      dispatch({ type: "started" })
      const reading = readUnder(under)
      inFlight = reading
      void reading.then(() => {
        if (inFlight === reading) inFlight = null
      })
      return reading
    },
    choose(kind, said): boolean {
      const pairing = ports.pairing()
      if (!readable || ports.storage === null || pairing === null) return false
      const next = appendedRead(log, { kind, pairing, at: ports.now(), said })
      if (next === log) return true
      try {
        ports.storage.setItem(READS_KEY, JSON.stringify(next))
      } catch {
        return false
      }
      log = next
      changed({ log, read: snapshot.read })
      settle()
      return true
    },
  }
}

let reads: RoutineReads | null = null

/** One runtime per page load, over the link; reads only this phone's log. */
export function routineReads(): RoutineReads {
  reads ??= createRoutineReads({
    keep: (run) => homeLink().keep(run),
    pairing: () => {
      const { link } = homeLink().getSnapshot()
      return link.kind === "paired" ? link.id : null
    },
    visible: () => document.visibilityState === "visible",
    now: Date.now,
    storage: localStorageOrNull(),
    onLink: (listener) => homeLink().subscribe(listener),
  })
  return reads
}
