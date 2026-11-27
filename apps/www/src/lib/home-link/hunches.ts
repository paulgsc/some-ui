/**
 * The shop's part of the one drain (`./drain`, KP4, #3596): each hunch this
 * phone keeps because home didn't answer its look-up (`lib/shop-home`'s
 * outbox), sent again as one `POST /phrases/lookup` each (paulgsc/server
 * `handlers::phrases`, #1265), its words and its name only. Home keeps a
 * miss once per name, so an answer, hit or kept, lets the hunch go; one home
 * refused (`422`) stays, and the run says so.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"
import { unexpectedAnswer } from "@some-ui/core-utils"

import type { PendingHunch } from "@/lib/shop-home/outbox"

/** How the part ended, and which hunches home answered. */
export type HunchesSent = {
  readonly answered: ReadonlySet<string>
  /** Home refused one: it stays, and the run ends short. */
  readonly refused: boolean
  /** The run's end, when home's answer ends it (forgotten, or unexpected). */
  readonly ended: HomeExchanged | null
}

export async function sendHunches(
  going: ReadonlyArray<PendingHunch>,
  send: HomeCall
): Promise<HunchesSent> {
  const answered = new Set<string>()
  let refused = false
  for (const { words, hunch } of going) {
    const body = JSON.stringify({ words, hunch })
    const answer = await send("POST", "/phrases/lookup", body)
    if (answer.status === 200) {
      answered.add(hunch)
      continue
    }
    if (answer.status === 422) {
      refused = true
      continue
    }
    // A home without the route (404) or with meaning off (503): the rest
    // wait for the next run, and the parts after this one go.
    if (answer.status === 404 || answer.status === 503) break
    const ended: HomeExchanged =
      answer.status === 401
        ? { kind: "forgotten" }
        : unexpectedAnswer("a hunch", answer.status)
    return { answered, refused, ended }
  }
  return { answered, refused, ended: null }
}
