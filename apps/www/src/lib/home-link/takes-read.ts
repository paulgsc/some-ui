/**
 * The takes home keeps of this phone's owner, for Studio's Takes on home
 * (ST32; paulgsc/server `GET /voice-notes/takes`): one `GET` each time the
 * screen opens and on Try again, a search (a blank one reads the newest) or
 * Show the newest, through the link's `keep` (LA8). It sends nothing of the phone's but the search's
 * words, when there is a search (`?q=`), the last take of a page shown
 * when the next is asked for (`?after=`), and the kinds, topic and order
 * picked (`?kind=`, `?about=`, `?sort=`). Home answers each take's id, what
 * it is for, when it was recorded and reached home, its size, its set-aside
 * mark and the words home heard in it: never its audio, which Play asks for
 * one take at a time (`./voice-audio`). What the screen makes of the answer
 * is `lib/take-library`'s, its one caller.
 */
import type { HomeAnswer } from "@some-ui/core-utils"

import { homeLink } from "./index"
import { asked } from "./while-busy"

/** What a read asks besides a search (`@some-ui/soundbites`' `LibraryQuery`). */
export type TakesQuery = {
  readonly kinds: ReadonlyArray<string> | null
  readonly about: string | null
  readonly sort: "newest" | "oldest"
}

const EVERY: TakesQuery = { kinds: null, about: null, sort: "newest" }

/**
 * The read of the newest takes (TAKES20): of the kinds asked, every kind
 * (`kind=all`) when none are, about the topic picked, oldest first when
 * asked, those whose words hold `q`'s, from after take `after` when a page
 * past the first is asked for. Any `kind` asks a home at contract epoch 19
 * for the new read; a home before it ignores every key but `q` and answers
 * Studio's alone.
 */
export function takesPath(
  q: string | null,
  after: string | null = null,
  query: TakesQuery = EVERY
): string {
  const pair = (key: string, value: string): string =>
    `${key}=${encodeURIComponent(value)}`
  const pairs = [
    ...(query.kinds === null || query.kinds.length === 0
      ? [pair("kind", "all")]
      : query.kinds.map((kind) => pair("kind", kind))),
    ...(query.about === null ? [] : [pair("about", query.about)]),
    ...(query.sort === "oldest" ? [pair("sort", "oldest")] : []),
    ...(q === null ? [] : [pair("q", q)]),
    ...(after === null ? [] : [pair("after", after)]),
  ]
  const path = "/voice-notes/takes"
  return `${path}?${pairs.join("&")}`
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
  after: string | null = null,
  query: TakesQuery = EVERY
): Promise<TakesAsked> {
  return asked(() =>
    homeLink().keep((send) => send("GET", takesPath(q, after, query)))
  )
}
