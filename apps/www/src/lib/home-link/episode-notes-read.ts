/**
 * The notes home keeps on a feed's episodes (SFEED6, #2745; paulgsc/server
 * `routes::episode_notes`), through the link (LA8): one
 * `GET /feeds/:feed/notes` per feed each time Studio's Feedback page reads
 * them, as it opens and on a drag down. Nothing of the phone's is sent. What the page
 * makes of the answer is `lib/episode-feedback/home`'s.
 */
import type { Feed } from "@/lib/feeds"

import { homeLink } from "./index"
import type { Asked } from "./while-busy"
import { asked } from "./while-busy"

/** Asks home once for the notes it keeps on `feed`'s episodes; never rejects. */
export function askEpisodeNotes(feed: Feed): Promise<Asked> {
  return asked(() =>
    homeLink().keep((send) => send("GET", `/feeds/${feed}/notes`))
  )
}
