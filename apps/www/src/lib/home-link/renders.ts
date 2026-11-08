/**
 * What home is rendering (SFEED13, #2761; paulgsc/server `routes::renders`),
 * through the link (LA8): one `GET /renders` each time Studio › Renders or
 * Studio's index opens, on a drag down, on Try again, and every half minute
 * while home is making something. Nothing of the phone's is sent. What the
 * screen makes of the answer is `lib/renders`'s.
 */
import type { BoardRead } from "@/lib/renders/model"
import { readBoard } from "@/lib/renders/model"

import { homeLink, paired } from "./index"

/** What reading home came to: its board, or why there is none. */
export type RendersOutcome =
  | BoardRead
  | { readonly kind: "unpaired" }
  | { readonly kind: "away" }

/** Reads home's render jobs once; never rejects. */
export async function readRenders(): Promise<RendersOutcome> {
  if (!paired()) return { kind: "unpaired" }
  try {
    const outcome = await homeLink().keep((send) => send("GET", "/renders"))
    // The link was busy with another run, or the page went: home is away for now.
    if (outcome?.kind !== "done") return { kind: "away" }
    return readBoard(outcome.value)
  } catch {
    return { kind: "away" }
  }
}
