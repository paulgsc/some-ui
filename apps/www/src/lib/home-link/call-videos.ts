/**
 * The weekly call's videos on home, for Studio's Calls (ST38; paulgsc/server
 * `routes::call_videos`), through the link (LA8):
 *
 * - the list of weeks home holds, one `GET /call/videos` each time the
 *   screen opens, on a drag down and on Try again;
 * - a week's video, one `GET /call/videos/:from/video` per part of it the
 *   phone fetches, each a range of at most `PART_BYTES`, while Watch fetches
 *   it into the phone's cache;
 * - the week's `YouTube` link, one `PUT /call/videos/:from/link` per Save,
 *   which a tap starts.
 *
 * All three go through the link's `keep`, as Ideas on home's writes do.
 *
 * Nothing of the phone's is sent but the link the owner pasted. What the
 * screen makes of each answer is `lib/call-videos`'s, its one caller.
 */
import type { HomeAnswer } from "@some-ui/core-utils"

import { homeLink, paired } from "./index"

/** The list of the weeks home holds. */
const CALL_VIDEOS_PATH = "/call/videos"

/** A week's video. */
function videoPath(from: string): string {
  return `/call/videos/${encodeURIComponent(from)}/video`
}

/** A week's `YouTube` link. */
function linkPath(from: string): string {
  return `/call/videos/${encodeURIComponent(from)}/link`
}

/** The most bytes of a video one request asks for: about 4 MB. */
export const PART_BYTES = 4 * 1024 * 1024

/** Home's answer, or why there is none. */
export type CallAsked =
  | { readonly kind: "answered"; readonly answer: HomeAnswer }
  /** Not paired: nothing was asked. */
  | { readonly kind: "unpaired" }
  /** The link was busy with another run, or the page went: ask again. */
  | { readonly kind: "busy" }
  /** No answer. */
  | { readonly kind: "unreachable" }

async function asked(
  run: () => Promise<
    { kind: "done"; value: HomeAnswer } | { kind: "stopped" } | null
  >
): Promise<CallAsked> {
  if (!paired()) return { kind: "unpaired" }
  try {
    const outcome = await run()
    return outcome?.kind === "done"
      ? { kind: "answered", answer: outcome.value }
      : { kind: "busy" }
  } catch {
    return { kind: "unreachable" }
  }
}

/** Asks home once for the weeks it holds; never rejects. */
export function askCallVideos(): Promise<CallAsked> {
  return asked(() => homeLink().keep((send) => send("GET", CALL_VIDEOS_PATH)))
}

/**
 * Asks home once for bytes `start` to `end` of a week's video; the answer's
 * body is them as base64. Never rejects.
 */
export function askVideoPart(
  from: string,
  start: number,
  end: number
): Promise<CallAsked> {
  return asked(() =>
    homeLink().keep((send) =>
      send("GET", videoPath(from), undefined, { start, end })
    )
  )
}

/** Sends home the link the owner pasted for a week, once; never rejects. */
export function sendLink(from: string, link: string): Promise<CallAsked> {
  return asked(() =>
    homeLink().keep((send) =>
      send("PUT", linkPath(from), JSON.stringify({ link }))
    )
  )
}
