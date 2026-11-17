/**
 * Whether the phone opens on the welcome that pairs it with home (SIGNIN2,
 * #3088): only once its own record is read and it holds no pairing, and
 * only until the person says "Not now", which this phone remembers
 * (docs/calls/C471.json). After a restore that lost the pairing it opens
 * on the welcome again, with that said first. Pure but for the remembered
 * choice, which `./remembered` keeps.
 */
import { assertNever } from "@some-ui/core-utils"

import type { HomeLinkState } from "./model"
import { remember, remembered } from "./remembered"

const NOT_NOW_KEY = "some-ui.home.welcome-not-now.v1"

/**
 * What the person said on this phone: nothing yet, "Not now" to the
 * welcome, or "Not now" to the welcome after a restore lost the pairing.
 * Kept apart so a restore, which brings this phone's storage back but never
 * its pairing, opens on the welcome even where "Not now" was said before.
 */
export type NotNow = "" | "welcome" | "restored"

/**
 * Whether `state` is a phone the welcome is for, given what the person
 * said: never paired, or its pairing unreadable, until they said "Not
 * now"; a pairing a restore lost, until they said it to that. Not one they
 * just unpaired themselves.
 */
export function firstRun(state: HomeLinkState, notNow: NotNow): boolean {
  const { link } = state
  if (link.kind !== "unpaired") return false
  switch (link.note) {
    case "lost": {
      return notNow !== "restored"
    }
    case null:
    case "unreadable": {
      return notNow === ""
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

/** What the person said on this phone. */
export function saidNotNow(): NotNow {
  const said = remembered(NOT_NOW_KEY)
  return said === "welcome" || said === "restored" ? said : ""
}

/** Keeps "Not now", said to the welcome or to it after a restore. */
export function sayNotNow(to: Exclude<NotNow, "">): void {
  remember(NOT_NOW_KEY, to)
}
