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

/** The ask, made once. */
export function servesRun(): ServesRun {
  serves ??= createServes({
    read: () => askCompat(SERVER_CONTRACT_EPOCH),
    now: LINK_CLOCK.now,
  })
  return serves
}

/**
 * What home last said of this build; null when it said nothing on this
 * pairing, or nothing has asked yet (the app shell's `useHomeServes` asks).
 * Reading it never asks.
 */
export const servesNow = (): Serves | null =>
  serves?.getSnapshot().serves ?? null
