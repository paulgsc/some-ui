/**
 * The written-reflections part of the one drain (`./drain`, LA16,
 * docs/learner-data-authority.md): each typed line this phone keeps that
 * home does not hold as it is now, one PUT each (paulgsc/server
 * `routes::routine`, `PUT /routine/reflections/:id`, docs/identity.md
 * invariant 29), counted as home's only once home answers with it exactly
 * as sent. Home keeps it for good and hands what the reflections routine
 * reads of it to the Jobs mailbox. A spoken reflection goes home as its
 * voice note (LA13), and the one-tap answers stay on the phone.
 */
import type { HomeCall } from "@some-ui/core-utils"

import type { Reflection } from "@/lib/session-reflection"

import type { LogReport, WholeLane } from "./leetype-log"
import { heldBy, sendWhole } from "./leetype-log"
import type { Sent } from "./sent"

/** A typed line: the only reflection the drain sends. */
export type Written = Reflection & {
  readonly body: { readonly kind: "text"; readonly text: string }
}

function isWritten(reflection: Reflection): reflection is Written {
  return reflection.body.kind === "text"
}

/** A written reflection goes as the phone keeps it, under its id. */
const REFLECTIONS: WholeLane<Written> = {
  path: "/routine/reflections",
  wire: (reflection) => reflection,
  key: "reflection",
  id: (reflection) => reflection.id,
}

/** The written reflections in `kept` home does not hold as they are now. */
export function writtenToSend(
  kept: ReadonlyArray<Reflection>,
  sent: Sent
): Array<Written> {
  const held = heldBy(REFLECTIONS, sent.reflections)
  return kept.filter(isWritten).filter((reflection) => !held(reflection))
}

/** The ids of the written reflections in `kept` home holds as they are now. */
export function heldWritten(
  kept: ReadonlyArray<Reflection>,
  sent: Sent
): Set<string> {
  return new Set(
    kept
      .filter(isWritten)
      .filter(heldBy(REFLECTIONS, sent.reflections))
      .map((reflection) => reflection.id)
  )
}

/** `sendWhole` over the written reflections (`./drain`'s reflections part). */
export const sendReflections = (
  going: ReadonlyArray<Written>,
  send: HomeCall,
  report: LogReport,
  held: (id: string, fingerprint: string) => void
): Promise<void> => sendWhole(REFLECTIONS, going, send, report, held)
