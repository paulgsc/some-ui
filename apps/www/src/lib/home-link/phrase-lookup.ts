/**
 * The shop's look-up on home (KPLAY's KP4, #2853; paulgsc/server
 * `handlers::phrases`, #1265): one request per hunch sent, or sent again,
 * through the link's `keep` (LA8). It sends the hunch's words and its name,
 * nothing else of the phone's. What the shop makes of the answer is
 * `lib/shop-home`'s, its one caller.
 */
import { homeLink } from "./index"
import type { Asked } from "./while-busy"
import { asked } from "./while-busy"

/** `POST /phrases/lookup`'s body: the owner's words and the hunch's name. */
export type LookupAsk = { readonly words: string; readonly hunch: string }

/** Asks home once; never rejects. */
export function askLookup(ask: LookupAsk): Promise<Asked> {
  const body = JSON.stringify({ words: ask.words, hunch: ask.hunch })
  return asked(() =>
    homeLink().keep((send) => send("POST", "/phrases/lookup", body))
  )
}
