/**
 * A cards essay's video on home (CARDS7, #2979; paulgsc/server
 * `routes::cards_essays`), through the link (LA8):
 * `GET /cards-essays/:key/video`, a range of at most `PART_BYTES`
 * (`lib/call-videos/parts`) per part, while Watch brings it to the phone.
 * The essays themselves are rows on Studio › Renders (`lib/renders`).
 *
 * Nothing of the phone's is sent. What the screen makes of each answer is
 * `lib/cards-essay-video`'s, its one caller.
 */
import { homeLink } from "./index"
import type { Asked } from "./while-busy"
import { asked } from "./while-busy"

const videoPath = (key: string): string =>
  `/cards-essays/${encodeURIComponent(key)}/video`

/** Asks home once for bytes `start` to `end` of essay `key`'s video; never rejects. */
export function askCardsEssayPart(
  key: string,
  start: number,
  end: number
): Promise<Asked> {
  return asked(() =>
    homeLink().keep((send) =>
      send("GET", videoPath(key), undefined, { start, end })
    )
  )
}
