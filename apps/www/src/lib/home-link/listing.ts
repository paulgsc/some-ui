/**
 * A screen's look at a list the paired home holds for it, run over
 * `./routine-model`: one `GET` of the list's own path through the link's
 * `keep`, on a paired phone (LA8, LA15, docs/learner-data-authority.md).
 * Korean's look at what the reflections routine left (`./routine`,
 * `/routine/files`) and LeetType's at the session files home holds
 * (`./leetype-files`, `/leetype/session-files`) are its two members; each
 * names its path and parses the answer itself.
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
 *   Home's answer is held in memory only.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { jsonOf } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"

import { ForeignCallError } from "@/lib/intent/foreign"

import type { ReadEvent, ReadState, Under } from "./routine-model"
import { heldFor, INITIAL_READ, mayRead, stepRead } from "./routine-model"
import type { HomeLink } from "./runtime"
import { blockedOf, unanswered } from "./settle"

/** What `list` answers when nothing was read under the pairing held now. */
const NO_FILES = { files: [] } as const

export type ListingPorts = {
  keep: HomeLink["keep"]
  /** The id of the pairing this phone holds, or null. */
  pairing: () => string | null
  /** The app is in front. */
  visible: () => boolean
  now: () => number
  /** Calls `listener` when the link changes (an unpairing, a new pairing). */
  onLink: (listener: () => void) => () => void
}

/** Which list: its path under home's API, and its name in the native log. */
export type Listing = {
  readonly path: string
  readonly port: string
}

export type ListingReads = {
  getSnapshot: () => ReadState
  subscribe: (listener: () => void) => () => void
  /** Home's answer, as it came (its screen parses it); never rejects. */
  list: () => Promise<unknown>
  /** A look is on its way. */
  looking: () => boolean
  /** Calls `listener` each time a look settles; returns an unsubscribe. */
  onSettled: (listener: () => void) => () => void
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

/**
 * A fault on this phone, not home's silence: it goes to the native log
 * (once: a foreign call's own port has already reported it).
 */
export function reportListingFault(port: string, error: unknown): void {
  if (error instanceof ForeignCallError) return
  reportFailure({
    port,
    error: {
      ...toIntentError(error),
      summary: "Something on this phone went wrong.",
    },
  })
}

export function createListingReads(
  listing: Listing,
  ports: ListingPorts
): ListingReads {
  let state: ReadState = INITIAL_READ
  const listeners = new Set<() => void>()
  const settledListeners = new Set<() => void>()
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
      outcome = await ports.keep((send) => send("GET", listing.path))
    } catch (error) {
      // Home not reached, for no reason on this phone (AW1, NA1).
      if (unanswered(error) || blockedOf(error) !== null) {
        return end(under, "unreachable")
      }
      reportListingFault(listing.port, error)
      return end(under, "failed")
    }
    if (outcome.kind === "refused") {
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
        for (const listener of settledListeners) listener()
      }
      reading.then(done, done)
      return reading
    },
    looking: () => inFlight !== null,
    onSettled(listener): () => void {
      settledListeners.add(listener)
      return (): void => {
        settledListeners.delete(listener)
      }
    },
  }
}
