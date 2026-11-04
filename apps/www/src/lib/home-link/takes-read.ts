/**
 * The takes home keeps of this phone's owner, for Studio's Takes on home
 * (ST32; paulgsc/server `GET /voice-notes/takes`): one `GET` each time the
 * screen opens and on Try again, a search (a blank one reads the newest) or
 * Show the newest, through the link's `keep` (LA8). It sends nothing of the phone's but the search's
 * words, when there is a search (`?q=`). Home answers each take's id, what
 * it is for, when it was recorded and reached home, its size, its set-aside
 * mark and the words home heard in it: never its audio, which Play asks for
 * one take at a time (`./voice-audio`). What the screen makes of the answer
 * is `lib/take-library`'s, its one caller.
 */
import type { HomeAnswer } from "@some-ui/core-utils"

import { homeLink, paired } from "./index"

/** The read of the newest takes, or of those whose words hold `q`'s. */
export function takesPath(q: string | null): string {
  return q === null
    ? "/voice-notes/takes"
    : `/voice-notes/takes?q=${encodeURIComponent(q)}`
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
export async function askTakes(q: string | null): Promise<TakesAsked> {
  if (!paired()) return { kind: "unpaired" }
  try {
    const outcome = await homeLink().keep((send) => send("GET", takesPath(q)))
    return outcome?.kind === "done"
      ? { kind: "answered", answer: outcome.value }
      : { kind: "busy" }
  } catch {
    return { kind: "unreachable" }
  }
}
