/**
 * The takes home keeps of this phone's owner, for Studio's Takes on home
 * (ST32; paulgsc/server `GET /voice-notes/takes`): one `GET` each time the
 * screen opens and on Try again, a search (a blank one reads the newest) or
 * Show the newest, through the link's `keep` (LA8). It sends nothing of the phone's but the search's
 * words, when there is a search (`?q=`), and the last take of a page shown
 * when the next is asked for (`?after=`). Home answers each take's id, what
 * it is for, when it was recorded and reached home, its size, its set-aside
 * mark and the words home heard in it: never its audio, which Play asks for
 * one take at a time (`./voice-audio`). What the screen makes of the answer
 * is `lib/take-library`'s, its one caller.
 */
import type { HomeAnswer } from "@some-ui/core-utils"

import { homeLink } from "./index"
import { asked } from "./while-busy"

/**
 * The read of the newest takes of every kind, or of those whose words hold
 * `q`'s, from after take `after` when a page is asked for past the first
 * (TAKES20). `kind=all` asks a home at contract epoch 19 for every kind; a
 * home before it ignores the key and answers Studio's alone.
 */
export function takesPath(
  q: string | null,
  after: string | null = null
): string {
  const query = [
    "kind=all",
    ...(q === null ? [] : [`q=${encodeURIComponent(q)}`]),
    ...(after === null ? [] : [`after=${encodeURIComponent(after)}`]),
  ]
  const path = "/voice-notes/takes"
  return `${path}?${query.join("&")}`
}

/** Home's answer, or why there is none. */
export type TakesAsked =
  | { readonly kind: "answered"; readonly answer: HomeAnswer }
  /** Not paired: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** The link was busy with another run, or the page went: ask again. */
  | { readonly kind: "busy" }
  /** No answer. */
  | { readonly kind: "unreachable" }

/** Asks home once for the takes it keeps; never rejects. */
export async function askTakes(
  q: string | null,
  after: string | null = null
): Promise<TakesAsked> {
  return asked(() =>
    homeLink().keep((send) => send("GET", takesPath(q, after)))
  )
}
