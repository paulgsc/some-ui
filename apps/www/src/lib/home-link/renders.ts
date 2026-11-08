/**
 * What home is rendering (SFEED13, #2761; paulgsc/server `routes::renders`),
 * through the link (LA8): one `GET /renders` each time Studio's index or
 * Studio › Renders reads it, on a drag down, on Try again, and every half
 * minute while home has something under way. Nothing of the phone's is
 * sent. What the screen makes of the answer is `lib/renders`'s.
 */
import { homeLink } from "./index"
import type { Asked } from "./while-busy"
import { asked } from "./while-busy"

/** Asks home once what it is rendering; never rejects. */
export function askRenders(): Promise<Asked> {
  return asked(() => homeLink().keep((send) => send("GET", "/renders")))
}
