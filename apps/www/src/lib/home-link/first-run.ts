/**
 * Whether the phone opens on the welcome that pairs it with home (SIGNIN2,
 * #3088; docs/calls/C471.json). What this phone remembers of the welcome
 * and its pairing (`Seen`) decides it with the link's state:
 *
 * - never paired, or its record unreadable on a phone that remembers no
 *   pairing: the welcome, until the person says "Not now" or the phone is
 *   paired;
 * - a pairing gone without an unpair: the welcome, with that said first,
 *   until "Not now" is said to it. A restore or a move to a new phone brings
 *   back what this phone remembers but never its pairing (the backup leaves
 *   the record out), so a phone that remembers being paired and holds no
 *   record lost it; the record reported lost says the same;
 * - a phone the person unpaired: never, even after a restart, when the
 *   record is gone and would read as never paired.
 */
import { assertNever } from "@some-ui/core-utils"

import type { HomeLinkState } from "./model"
import { remember, remembered } from "./remembered"

const SEEN_KEY = "some-ui.home.welcome-not-now.v1"

/**
 * What this phone remembers: nothing, "Not now" (to the welcome or after a
 * restore), that it is paired, or that the person unpaired it.
 */
export type Seen = "" | "welcome" | "restored" | "paired" | "unpaired"

/** Whether `state`'s welcome is for a pairing gone without an unpair. */
export function restored(state: HomeLinkState, seen: Seen): boolean {
  const { link } = state
  return (
    link.kind === "unpaired" &&
    (link.note === "lost" || (link.note === null && seen === "paired"))
  )
}

/** Whether `state` opens on the welcome, given what this phone remembers. */
export function firstRun(state: HomeLinkState, seen: Seen): boolean {
  const { link } = state
  if (link.kind !== "unpaired") return false
  if (restored(state, seen)) return seen !== "restored"
  switch (link.note) {
    // A record there but not read just now is no reason to pair again on a
    // phone that remembers a pairing.
    case null:
    case "unreadable": {
      return seen === ""
    }
    case "lost":
    case "unpaired":
    case "unpaired-offline": {
      return false
    }
    default: {
      return assertNever(link.note)
    }
  }
}

/**
 * Whether the welcome could open once the record is read: nothing is
 * remembered, or a pairing is, which a restore may have lost. A record
 * reported lost opens it whatever is remembered, but that is rare (a key
 * the phone reset), so the foyer doesn't wait on it. The cost: a paired
 * phone's foyer is blank until its record is read, at most the read's 5 s
 * deadline (`./credential`), usually a few milliseconds.
 */
export const mayOpen = (seen: Seen): boolean => seen === "" || seen === "paired"

/** What this phone remembers. */
export function seenHere(): Seen {
  const seen = remembered(SEEN_KEY)
  return seen === "welcome" ||
    seen === "restored" ||
    seen === "paired" ||
    seen === "unpaired"
    ? seen
    : ""
}

/** Keeps what this phone saw: "Not now" said, a pairing, or an unpair. */
export function rememberSeen(seen: Exclude<Seen, "">): void {
  remember(SEEN_KEY, seen)
}

/** What `state` says to remember of the pairing, if anything. */
function pairingSeen(state: HomeLinkState): "paired" | "unpaired" | null {
  const { link } = state
  // An unpair under way: Settings remembered it as it was pressed, and the
  // link says how it ended (paired again if it failed).
  if (state.activity.kind === "unpairing") return null
  if (link.kind === "paired") return "paired"
  if (
    link.kind === "unpaired" &&
    (link.note === "unpaired" || link.note === "unpaired-offline")
  ) {
    return "unpaired"
  }
  return null
}

/**
 * Keeps what tells a restore from an unpair once the record is gone: that
 * the phone is paired, and that the person unpaired it, each time the link
 * changes, until the returned unsubscribe is called. The app shell runs it
 * on every screen, so a pairing made in Settings is remembered whichever
 * screen the phone opens on next, and an unpair that failed is forgotten
 * as the link stays paired.
 */
export function watchPairing(link: {
  getSnapshot: () => HomeLinkState
  subscribe: (listener: () => void) => () => void
}): () => void {
  const keep = (): void => {
    const seen = pairingSeen(link.getSnapshot())
    if (seen !== null && seenHere() !== seen) rememberSeen(seen)
  }
  keep()
  return link.subscribe(keep)
}
