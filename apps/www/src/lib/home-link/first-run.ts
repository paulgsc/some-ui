/**
 * Whether the phone opens on the welcome that pairs it with home (SIGNIN2,
 * #3088; docs/calls/C471.json). What this phone remembers of the welcome
 * (`Seen`) decides it with the link's state:
 *
 * - never paired, or its record unreadable: the welcome, until the person
 *   says "Not now" or the phone is paired;
 * - a pairing a restore lost: the welcome, with that said first, until
 *   "Not now" is said to it. A restore brings this phone's storage back but
 *   never its pairing, so what was remembered before it opens it again;
 * - a phone paired here before, unpaired by the person since: never, even
 *   after a restart, when the record is gone and reads as never paired.
 */
import { assertNever } from "@some-ui/core-utils"

import type { HomeLinkState } from "./model"
import { remember, remembered } from "./remembered"

const SEEN_KEY = "some-ui.home.welcome-not-now.v1"

/** What this phone remembers: nothing, "Not now" (to the welcome or after a restore), or a pairing. */
export type Seen = "" | "welcome" | "restored" | "paired"

/** Whether `state` opens on the welcome, given what this phone remembers. */
export function firstRun(state: HomeLinkState, seen: Seen): boolean {
  const { link } = state
  if (link.kind !== "unpaired") return false
  switch (link.note) {
    case "lost": {
      return seen !== "restored"
    }
    case null:
    case "unreadable": {
      return seen === ""
    }
    case "unpaired":
    case "unpaired-offline": {
      return false
    }
    default: {
      return assertNever(link.note)
    }
  }
}

/** Whether `state`'s welcome is for a pairing a restore lost. */
export const restored = (state: HomeLinkState): boolean =>
  state.link.kind === "unpaired" && state.link.note === "lost"

/** What this phone remembers. */
export function seenHere(): Seen {
  const seen = remembered(SEEN_KEY)
  return seen === "welcome" || seen === "restored" || seen === "paired"
    ? seen
    : ""
}

/** Keeps what this phone saw: "Not now" said, or a pairing. */
export function rememberSeen(seen: Exclude<Seen, "">): void {
  remember(SEEN_KEY, seen)
}
