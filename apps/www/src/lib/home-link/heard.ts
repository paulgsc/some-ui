/**
 * Home's words for one voice note (MIC10, #2428; paulgsc/server
 * `GET /voice-notes/:id/heard`): asked for by Studio's idea screen while it
 * shows a take home is hearing (`@some-ui/soundbites`' `homeHearing`, through
 * `lib/idea-hearing`), one `GET` every few seconds for a few minutes at most,
 * through the link's `keep` (LA8). It sends nothing of the phone's but the
 * note's id.
 *
 * - `404`: home doesn't hold the note (yet: it may still be on its way);
 * - `200` `{ "heard": null }`: home holds it and hasn't heard it yet;
 * - `200` `{ "heard": { "text", "heardAt" } }`: what home heard, other
 *   fields ignored.
 *
 * A link already busy with another run (or stopped by the page going), and
 * home saying it is busy (`429`, as the link reads it) or that a gateway
 * before it is (`502`, `503`, `504`), is `busy`: the screen asks again on
 * its next poll. Anything else, an unreadable body, or no answer, is
 * `unreachable`: home can't give the words now, and the screen stops
 * waiting for them.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type { HeardAnswer } from "@some-ui/soundbites"
import { z } from "zod"

import { homeLink, paired } from "./index"

const Heard = z.object({
  // Other fields home adds are let through unread.
  heard: z.object({ text: z.string(), heardAt: z.string() }).nullable(),
})

/** The read of note `id`'s words, as home takes it. */
export function heardPath(id: string): string {
  return `/voice-notes/${encodeURIComponent(id)}/heard`
}

/** Statuses that say home, or what is before it, is busy for now. */
const BUSY = new Set([429, 502, 503, 504])

/** What home's answer says of the note's words. */
export function readHeard(answer: HomeAnswer): HeardAnswer {
  if (answer.status === 404) return { kind: "notHeld" }
  if (BUSY.has(answer.status)) return { kind: "busy" }
  if (answer.status !== 200) return { kind: "unreachable" }
  const read = readAs(Heard, answer.body)
  if (read === null) return { kind: "unreachable" }
  return read.heard === null
    ? { kind: "notYet" }
    : { kind: "heard", text: read.heard.text }
}

/** Home's words for note `id`, asked once; never rejects. */
export async function askHeard(id: string): Promise<HeardAnswer> {
  if (!paired()) return { kind: "unreachable" }
  try {
    const outcome = await homeLink().keep((send) => send("GET", heardPath(id)))
    return outcome?.kind === "done"
      ? readHeard(outcome.value)
      : { kind: "busy" }
  } catch {
    return { kind: "unreachable" }
  }
}
