/**
 * The written-reflections part of the one drain (`./drain`, LA16,
 * docs/learner-data-authority.md): each typed line this phone keeps that
 * home does not hold as it is now, one PUT each (paulgsc/server
 * `routes::routine`, `PUT /routine/reflections/:id`, docs/identity.md
 * invariant 29), counted as home's only once home answers with it exactly
 * as sent. Home keeps it for good and hands what the reflections routine
 * reads of it to the Jobs mailbox. A spoken reflection goes home as its
 * voice note (LA13), and the one-tap answers stay on the phone.
 *
 * What home holds lets the phone keep only its offline set: the drain then
 * lets go of the written reflections past it that home holds
 * (`heldWritten`, the store's `trimOffline`).
 */
import type { HomeCall } from "@some-ui/core-utils"
import { canonicalJson, isRecord } from "@some-ui/core-utils"

import type { Reflection } from "@/lib/session-reflection"

import type { LogReport } from "./leetype-log"
import { bucketOf } from "./leetype-log"
import type { Sent } from "./sent"
import { answerOrEnd } from "./shelf"

/** A typed line: the only reflection the drain sends. */
export type Written = Reflection & {
  readonly body: { readonly kind: "text"; readonly text: string }
}

function isWritten(reflection: Reflection): reflection is Written {
  return reflection.body.kind === "text"
}

/** `sent.reflections`' entry for `reflection`: the whole of it, as sent. */
const digestOf = (reflection: Written): string => canonicalJson(reflection)

/** The written reflections in `kept` home does not hold as they are now. */
export function writtenToSend(
  kept: ReadonlyArray<Reflection>,
  sent: Sent
): Array<Written> {
  return kept
    .filter(isWritten)
    .filter(
      (reflection) => sent.reflections[reflection.id] !== digestOf(reflection)
    )
}

/** The ids of the written reflections in `kept` home holds as they are now. */
export function heldWritten(
  kept: ReadonlyArray<Reflection>,
  sent: Sent
): Set<string> {
  return new Set(
    kept
      .filter(isWritten)
      .filter(
        (reflection) => sent.reflections[reflection.id] === digestOf(reflection)
      )
      .map((reflection) => reflection.id)
  )
}

/** Home's answer holds `reflection` exactly as it was sent. */
function holds(reflection: Written, body: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return false
  }
  return (
    isRecord(parsed) &&
    isRecord(parsed.reflection) &&
    canonicalJson(parsed.reflection) === digestOf(reflection)
  )
}

/**
 * Sends `going` through `send`, one PUT each, into `report` (a refusal or
 * an answer that does not hold what was sent is counted, and that one stays
 * on the phone, to go again with the next run); `held` hears each one home
 * holds as sent, with its digest.
 */
export async function sendReflections(
  going: ReadonlyArray<Written>,
  send: HomeCall,
  report: LogReport,
  held: (id: string, digest: string) => void
): Promise<void> {
  for (const reflection of going) {
    const answer = await answerOrEnd(
      send,
      report,
      "PUT",
      `/routine/reflections/${encodeURIComponent(reflection.id)}`,
      JSON.stringify(reflection)
    )
    if (answer === null) return
    const bucket = bucketOf(answer.status)
    if (bucket !== "held") {
      report[bucket] += 1
    } else if (holds(reflection, answer.body)) {
      report.held += 1
      held(reflection.id, digestOf(reflection))
    } else {
      report.differs += 1
    }
  }
}
