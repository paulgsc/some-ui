/**
 * The shop's part of the one drain (`./drain`, KP4, #3596): each hunch this
 * phone keeps because home didn't answer its look-up (`lib/shop-home`'s
 * outbox), sent again as one `POST /phrases/lookup` each (paulgsc/server
 * `handlers::phrases`, #1265), its words and its name only. Home keeps a
 * miss once per name, so an answer, hit or kept, lets the hunch go; one home
 * refused (`422`) is set aside on the phone, and the run ends short once.
 * It is the drain's last part, so a home that can't look up holds back
 * nothing else.
 */
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"

import type { PendingHunch } from "@/lib/shop-home/outbox"

/** How the part ended, and what home said of each hunch it answered. */
export type HunchesSent = {
  readonly answered: ReadonlySet<string>
  /** Home refused these (`422`): set aside, and the run ends short. */
  readonly refused: ReadonlySet<string>
  /** The run's end when home no longer knows this phone (`401`). */
  readonly ended: HomeExchanged | null
}

export async function sendHunches(
  going: ReadonlyArray<PendingHunch>,
  send: HomeCall
): Promise<HunchesSent> {
  const answered = new Set<string>()
  const refused = new Set<string>()
  for (const { words, hunch } of going) {
    const body = JSON.stringify({ words, hunch })
    const answer = await send("POST", "/phrases/lookup", body)
    if (answer.status === 200) {
      answered.add(hunch)
      continue
    }
    if (answer.status === 422) {
      refused.add(hunch)
      continue
    }
    if (answer.status === 401)
      return { answered, refused, ended: { kind: "forgotten" } }
    // Anything else (no route yet, meaning off, busy, a fault on home):
    // the rest wait for the next run, and the run goes on.
    break
  }
  return { answered, refused, ended: null }
}
