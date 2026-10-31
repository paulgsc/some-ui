/**
 * The runtime behind `./routine-model`: Korean's look at what the
 * reflections routine left on the paired home (`GET /routine/files`,
 * paulgsc/server `handlers/routine.rs`), through the link's `keep`, on a
 * paired phone (LA8, LA15, docs/learner-data-authority.md). Home is the
 * owner's own store, so reading it asks nothing (HF8, #2182).
 *
 * - **Only paired, only under the pairing this phone holds, only in
 *   front.** `list` sends nothing unless the phone is paired and the app is
 *   visible; otherwise it answers with what it last read under that
 *   pairing, or no files.
 * - **One read at a time:** a call while one is on its way, under the same
 *   pairing, shares it. A look the link turns away (it is busy with another
 *   send) is said nowhere and answers what was held.
 * - **Never rejects, never retries.** The app's query retries a rejection,
 *   and LA8 allows no retry, so every way a read ends resolves: a refusal,
 *   home's silence or a fault on this phone is said in `last`, and the
 *   answer is the last one read under the same pairing.
 * - **Nothing outlives its pairing.** An answer that lands once the pairing
 *   is gone is dropped; an unpairing or a new pairing clears what was held.
 *   Home's files are held in memory only.
 * - **Which lessons were opened is told to home.** `tellOpened` sends one
 *   `PUT /routine/opened` of names, when Korean opens one, with the app in
 *   front, one at a time, never retried and never rejected, so the routine
 *   keeps three ready. One asked for while a look or another telling is on
 *   its way, or turned away by another send, waits: the newest is told once
 *   that look or telling settles, while the pairing is still this phone's,
 *   and the next open tells them all again.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { jsonOf } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import { ForeignCallError } from "@/lib/intent/foreign"

import { homeLink } from "./index"
import type { ReadEvent, ReadState, Under } from "./routine-model"
import { heldFor, INITIAL_READ, mayRead, stepRead } from "./routine-model"
import type { HomeLink } from "./runtime"
import { unanswered } from "./runtime"

/** What `list` answers when nothing was read under the pairing held now. */
const NO_FILES = { files: [] } as const

export type RoutinePorts = {
  keep: HomeLink["keep"]
  /** The id of the pairing this phone holds, or null. */
  pairing: () => string | null
  /** The app is in front. */
  visible: () => boolean
  now: () => number
  /** Calls `listener` when the link changes (an unpairing, a new pairing). */
  onLink: (listener: () => void) => () => void
}

export type RoutineReads = {
  getSnapshot: () => ReadState
  subscribe: (listener: () => void) => () => void
  /** Home's answer, as it came (topik parses it); never rejects. */
  list: () => Promise<unknown>
  /**
   * Tells home which of the routine's lessons this phone opened, by
   * `<folder>/<name>`, while paired and in front; never rejects.
   */
  tellOpened: (keys: ReadonlyArray<string>) => void
}

type Ended = Extract<ReadEvent, { type: "ended" }>["kind"]

/** What a read's answer says: home's files, or how it ended without them. */
function answerOf(answer: HomeAnswer): { files: unknown } | { ended: Ended } {
  if (answer.status === 401) return { ended: "forgotten" }
  if (answer.status === 429) return { ended: "busy" }
  if (answer.status !== 200) return { ended: "failed" }
  const files = jsonOf(answer.body)
  return files === undefined ? { ended: "failed" } : { files }
}

function reportFault(error: unknown): void {
  // A fault on this phone, not home's silence: it goes to the native log
  // (once: a foreign call's own port has already reported it).
  if (error instanceof ForeignCallError) return
  reportFailure({
    port: "home server (routine)",
    error: {
      ...toIntentError(error),
      summary: "Something on this phone went wrong.",
    },
  })
}

export function createRoutineReads(ports: RoutinePorts): RoutineReads {
  let state: ReadState = INITIAL_READ
  const listeners = new Set<() => void>()
  const dispatch = (event: ReadEvent): void => {
    const next = stepRead(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  // The pairing what is held was read under; cleared once it is not the one
  // this phone holds.
  let heldUnder: Under | null = null
  const settle = (): void => {
    if (heldUnder === null || heldUnder === ports.pairing()) return
    heldUnder = null
    dispatch({ type: "cleared" })
  }
  ports.onLink(settle)

  const heldNow = (): unknown => heldFor(state, ports.pairing()) ?? NO_FILES

  // A read that ended without files, said for the pairing it was made
  // under; dropped once that is not the one this phone holds.
  const end = (under: Under, kind: Ended): unknown => {
    if (under === ports.pairing()) {
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
      reportFault(error)
      return end(under, "failed")
    }
    if (outcome === null) {
      // Turned away: this phone's link was doing something else (a record
      // draining), or the phone is no longer paired, which `settle` clears.
      // Neither is home's to answer for, so nothing is said; the next look
      // asks again.
      dispatch({ type: "dropped" })
      settle()
      return heldNow()
    }
    if (outcome.kind === "stopped") {
      dispatch({ type: "dropped" })
      return heldNow()
    }
    const read = answerOf(outcome.value)
    if ("ended" in read) return end(under, read.ended)
    // Landed after an unpairing or a new pairing: nothing of it is kept.
    if (under !== ports.pairing()) {
      dispatch({ type: "dropped" })
      settle()
      return heldNow()
    }
    heldUnder = under
    dispatch({ type: "answered", under, files: read.files, at: ports.now() })
    return read.files
  }

  // The look on its way, and the pairing it was made under: a call under
  // another pairing does not share it.
  let inFlight: { under: Under; reading: Promise<unknown> } | null = null

  let telling = false
  // The newest names asked for while a look or a telling was on its way, or
  // that the link turned away for another send, with the pairing they were
  // asked under: told once that look or telling settles, and only while
  // that pairing is this phone's, so no home is told of another's.
  let waiting: { under: Under; keys: ReadonlyArray<string> } | null = null
  const startTelling = (under: Under, keys: ReadonlyArray<string>): void => {
    telling = true
    void tell(under, keys)
  }
  // A new pairing drops what waits under the old one.
  ports.onLink(() => {
    if (waiting !== null && waiting.under !== ports.pairing()) waiting = null
  })
  const flush = (): void => {
    if (waiting === null || telling || inFlight !== null) return
    const { under, keys } = waiting
    waiting = null
    if (ports.visible() && under === ports.pairing()) startTelling(under, keys)
  }
  const tell = async (
    under: Under,
    keys: ReadonlyArray<string>
  ): Promise<void> => {
    let turnedAway = false
    try {
      const outcome = await ports.keep((send) =>
        send("PUT", "/routine/opened", JSON.stringify({ opened: keys }))
      )
      if (outcome === null) {
        turnedAway = true
        waiting ??= { under, keys }
      }
    } catch (error) {
      // Home's silence is said nowhere: the next open tells it again.
      if (!unanswered(error)) reportFault(error)
    } finally {
      telling = false
      // Turned away: told when the next look settles, not straight back.
      if (!turnedAway) flush()
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    list(): Promise<unknown> {
      settle()
      const under = ports.pairing()
      if (under === null) return Promise.resolve(NO_FILES)
      if (inFlight !== null && inFlight.under === under) {
        return inFlight.reading
      }
      if (!mayRead(state, { under, visible: ports.visible() })) {
        return Promise.resolve(heldNow())
      }
      heldUnder ??= under
      dispatch({ type: "started" })
      const reading = readUnder(under)
      const looking = { under, reading }
      inFlight = looking
      const done = (): void => {
        if (inFlight === looking) inFlight = null
        flush()
      }
      reading.then(done, done)
      return reading
    },
    tellOpened(keys): void {
      const under = ports.pairing()
      if (keys.length === 0 || under === null || !ports.visible()) return
      if (telling || inFlight !== null) {
        waiting = { under, keys }
        return
      }
      startTelling(under, keys)
    },
  }
}

let reads: RoutineReads | null = null

/** One runtime per page load, over the link; reads only this phone's pairing. */
export function routineReads(): RoutineReads {
  reads ??= createRoutineReads({
    keep: (run) => homeLink().keep(run),
    pairing: () => {
      const { link } = homeLink().getSnapshot()
      return link.kind === "paired" ? link.id : null
    },
    visible: () => document.visibilityState === "visible",
    now: Date.now,
    onLink: (listener) => homeLink().subscribe(listener),
  })
  return reads
}
