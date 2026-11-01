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
 * Anything else, a link already busy with another run, or no answer, is
 * `unreachable`: the screen asks again on its next poll.
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

/** What home's answer says of the note's words. */
export function readHeard(answer: HomeAnswer): HeardAnswer {
  if (answer.status === 404) return { kind: "notHeld" }
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
      : { kind: "unreachable" }
  } catch {
    return { kind: "unreachable" }
  }
}
