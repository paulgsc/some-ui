/**
 * Asks home to hear one voice note before the rest of its line
 * (paulgsc/server `POST /voice-notes/:id/fast-track`, server#1090): sent by
 * KPLAY's shop once for a hunch it spoke (`lib/shop-home`, KP4), so the owner
 * isn't kept waiting behind other takes, through the link's `keep` (LA8). It
 * sends nothing of the phone's but the note's id.
 *
 * - `200` or `201`: home will hear it next;
 * - `404`: home doesn't hold the note yet (the voice lane is still taking it
 *   home): ask again later;
 * - busy (`429`, `503`, the link busy): ask again later;
 * - anything else, or no answer: home can't hear it sooner now.
 */
import { homeLink } from "./index"
import { answered } from "./while-busy"

export type FastTracked = "asked" | "notHeld" | "busy" | "unreachable"

/** The fast-track of note `id`, as home takes it. */
const fastTrackPath = (id: string): string =>
  `/voice-notes/${encodeURIComponent(id)}/fast-track`

/** Asks home once to hear note `id` next; never rejects. */
export async function askFastTrack(id: string): Promise<FastTracked> {
  const said = await answered(
    () =>
      homeLink().keep((send) => send("POST", fastTrackPath(id)), {
        onItsOwn: true,
      }),
    ({ status }): FastTracked =>
      status === 200 || status === 201
        ? "asked"
        : status === 404
          ? "notHeld"
          : status === 429 || status === 503
            ? "busy"
            : "unreachable"
  )
  return typeof said === "string"
    ? said
    : said.kind === "busy"
      ? "busy"
      : "unreachable"
}
