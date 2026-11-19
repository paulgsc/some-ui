/**
 * The one ask of whether home works with this build, per page load
 * (`./serves`), and what home last said: the marks read it (`./lanes`), and
 * the voice lane holds a note home before this build's epoch would refuse
 * (`./voice-copy`, RR24) until home says it serves this build.
 */
import { SERVER_CONTRACT_EPOCH } from "@some-ui/server-routes"

import { askCompat } from "./compat-read"
import { LINK_CLOCK } from "./index"
import type { ServesRun } from "./serves"
import { createServes } from "./serves"
import type { Serves } from "./serves-model"

let serves: ServesRun | null = null
const listeners = new Set<() => void>()

/** The ask, made once. */
export function servesRun(): ServesRun {
  if (serves === null) {
    serves = createServes({
      read: () => askCompat(SERVER_CONTRACT_EPOCH),
      now: LINK_CLOCK.now,
    })
    // Only what home says matters to a listener, never the ask's own steps.
    let said = serves.getSnapshot().serves
    serves.subscribe(() => {
      const now = serves?.getSnapshot().serves ?? null
      if (now === said) return
      said = now
      for (const listener of listeners) listener()
    })
  }
  return serves
}

/**
 * Calls `listener` each time what home says of this build changes,
 * whether or not the ask has been made yet: a lane holding what home must
 * serve first (RR24) moves as soon as home says it does. Never asks.
 */
export function onServes(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * What home last said of this build; null when it said nothing on this
 * pairing, or nothing has asked yet (the app shell's `useHomeServes` asks).
 * Reading it never asks.
 */
export const servesNow = (): Serves | null =>
  serves?.getSnapshot().serves ?? null
