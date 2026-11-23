/**
 * What home is rendering (SFEED13, #2761; paulgsc/server `routes::renders`),
 * through the link (LA8): one `GET /renders` each time Studio's index or
 * Studio › Renders reads it, on a drag down, on Try again, and every half
 * minute while home has something under way. Nothing of the phone's is
 * sent. What the screen makes of the answer is `lib/renders`'s; a run
 * again (RETRY) is one `POST` of its video's produce per tap on Run it
 * again.
 */
import { homeLink } from "./index"
import type { Asked } from "./while-busy"
import { asked } from "./while-busy"

/** Asks home once what it is rendering; never rejects. */
export function askRenders(): Promise<Asked> {
  return asked(() => homeLink().keep((send) => send("GET", "/renders")))
}

/** Where home makes part of `feed`'s episode `key` again. */
function producePath(feed: string, key: string): string {
  return `/feeds/${encodeURIComponent(feed)}/videos/${encodeURIComponent(key)}/produce`
}

/**
 * Asks home once to make a render that couldn't finish again (RETRY,
 * paulgsc/server `routes::feed_videos`' produce, its video): nothing of the
 * phone's but which one; never rejects.
 */
export function askRunAgain(feed: string, key: string): Promise<Asked> {
  return asked(() =>
    homeLink().keep((send) =>
      send("POST", producePath(feed, key), JSON.stringify({ asset: "video" }))
    )
  )
}
