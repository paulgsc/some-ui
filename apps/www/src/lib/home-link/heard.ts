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
 * A link already busy with another run (or stopped by the page going),
 * home saying it is busy (`429`, as the link reads it, or `503`), and home's
 * door answering for it (`502`, `504`, which the link holds as home
 * restarting, HR1, read here alone as busy) are `busy`: the screen asks again on
 * its next poll. Anything else, an unreadable body, or no answer, is
 * `unreachable`: home can't give the words now, and the screen stops
 * waiting for them.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import type { HeardAnswer } from "@some-ui/voice-capture"
import { z } from "zod"

import { homeLink } from "./index"
import { blockedOf } from "./settle"
import { answered, BUSY } from "./while-busy"

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
  // Home's door answering for it, or the hold it began (HR1): home is
  // restarting, so the screen polls again, as it did on a `502`.
  const met = { door: false }
  const said = await answered(async () => {
    try {
      return await homeLink().keep((send) => send("GET", heardPath(id)), {
        onItsOwn: true,
      })
    } catch (error) {
      met.door = blockedOf(error) === "door"
      throw error
    }
  }, readHeard)
  if (met.door) return { kind: "busy" }
  // Unpaired, home can't give the words: the screen stops waiting for them.
  return said.kind === "unpaired" ? { kind: "unreachable" } : said
}
