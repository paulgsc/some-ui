/**
 * Korean's look at what the reflections routine left on the paired home
 * (`GET /routine/files`, paulgsc/server `handlers/routine.rs`): one member
 * of `./listing`, which holds how a look goes (only paired, in front and
 * under the pairing held; one at a time; never rejected or retried; nothing
 * outliving its pairing), on a paired phone (LA8, LA15,
 * docs/learner-data-authority.md).
 *
 * - **Which lessons were opened is told to home.** `tellOpened` sends one
 *   `PUT /routine/opened` of names, when Korean opens one, with the app in
 *   front, one at a time, never retried and never rejected, so the routine
 *   keeps three ready. One asked for while a look or another telling is on
 *   its way, or turned away by another send, waits: the newest is told once
 *   that look or telling settles, while the pairing is still this phone's,
 *   and the next open tells them all again.
 */
import { homeLink } from "./index"
import type { ListingPorts, ListingReads } from "./listing"
import { createListingReads, reportListingFault } from "./listing"
import { unanswered } from "./settle"

const PORT = "home server (routine)"

export type RoutinePorts = ListingPorts

export type RoutineReads = Omit<ListingReads, "looking" | "onSettled"> & {
  /**
   * Tells home which of the routine's lessons this phone opened, by
   * `<folder>/<name>`, while paired and in front; never rejects.
   */
  tellOpened: (keys: ReadonlyArray<string>) => void
}

export function createRoutineReads(ports: RoutinePorts): RoutineReads {
  const look = createListingReads({ path: "/routine/files", port: PORT }, ports)

  let telling = false
  // The newest names asked for while a look or a telling was on its way, or
  // that the link turned away for another send, with the pairing they were
  // asked under: told once that look or telling settles, and only while
  // that pairing is this phone's, so no home is told of another's.
  let waiting: { under: string; keys: ReadonlyArray<string> } | null = null
  const startTelling = (under: string, keys: ReadonlyArray<string>): void => {
    telling = true
    void tell(under, keys)
  }
  // A new pairing drops what waits under the old one.
  ports.onLink(() => {
    if (waiting !== null && waiting.under !== ports.pairing()) waiting = null
  })
  const flush = (): void => {
    if (waiting === null || telling || look.looking()) return
    const { under, keys } = waiting
    waiting = null
    if (ports.visible() && under === ports.pairing()) startTelling(under, keys)
  }
  look.onSettled(flush)
  const tell = async (
    under: string,
    keys: ReadonlyArray<string>
  ): Promise<void> => {
    let turnedAway = false
    try {
      const outcome = await ports.keep((send) =>
        send("PUT", "/routine/opened", JSON.stringify({ opened: keys }))
      )
      if (outcome.kind === "refused") {
        turnedAway = true
        waiting ??= { under, keys }
      }
    } catch (error) {
      // Home's silence is said nowhere: the next open tells it again.
      if (!unanswered(error)) reportListingFault(PORT, error)
    } finally {
      telling = false
      // Turned away: told when the next look settles, not straight back.
      if (!turnedAway) flush()
    }
  }

  return {
    getSnapshot: look.getSnapshot,
    subscribe: look.subscribe,
    list: look.list,
    tellOpened(keys): void {
      const under = ports.pairing()
      if (keys.length === 0 || under === null || !ports.visible()) return
      if (telling || look.looking()) {
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
    // Asked as the lesson opens, not by a tap: held away from home (AW1).
    keep: (run) => homeLink().keep(run, { onItsOwn: true }),
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
