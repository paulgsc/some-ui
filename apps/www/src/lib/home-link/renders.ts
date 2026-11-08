/**
 * What home is rendering (SFEED13, #2761; paulgsc/server `routes::renders`),
 * through the link (LA8): one `GET /renders` each time Studio › Renders or
 * Studio's index opens, on a drag down, on Try again, and every half minute
 * while home is making something. Nothing of the phone's is sent. What the
 * screen makes of the answer is `lib/renders`'s.
 */
import type { CallAsked } from "./call-videos"
import { asked } from "./call-videos"
import { homeLink } from "./index"

/** Asks home once what it is rendering; never rejects. */
export function askRenders(): Promise<CallAsked> {
  return asked(() => homeLink().keep((send) => send("GET", "/renders")))
}
