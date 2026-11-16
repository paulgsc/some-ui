/**
 * The takes home couldn't hear well, for Studio's Takes › Needs your
 * attention (HEARD3, #3075; paulgsc/server#912): one `GET
 * /voice-notes/attention` each time the page opens and on Try again, and one
 * `POST /voice-notes/:id/attention` per act the owner takes on a take (keep
 * it, or record it again), through the link's `keep` (LA8). It sends
 * nothing of the phone's but the take's id and the act's name. Home answers
 * the takes with what it heard and its verdict, never their audio, which
 * Play asks for one take at a time (`./voice-audio`).
 */
import type { ReconcileAct } from "@some-ui/soundbites"

import { homeLink } from "./index"
import type { Asked } from "./while-busy"
import { asked } from "./while-busy"

/** The read of every take waiting on the owner. */
const ATTENTION_PATH = "/voice-notes/attention"

/** The act on take `id`, as home takes it. */
function actPath(id: string): string {
  return `/voice-notes/${encodeURIComponent(id)}/attention`
}

/** Asks home once for the takes waiting; never rejects. */
export function askAttention(): Promise<Asked> {
  return asked(() => homeLink().keep((send) => send("GET", ATTENTION_PATH)))
}

/** Tells home once of the owner's act on take `id`; never rejects. */
export function askAct(id: string, act: ReconcileAct): Promise<Asked> {
  return asked(() =>
    homeLink().keep((send) =>
      send("POST", actPath(id), JSON.stringify({ act }))
    )
  )
}
