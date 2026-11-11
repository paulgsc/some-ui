/**
 * A clip's frame on home (paulgsc/server `routes::clips`), through the link:
 * `GET /clips/:id/:side/:file`, the frame's PNG as home made or kept it, by
 * its file name within the side (`frameName`). Home keeps Studio's clip
 * frames (owner, 2026-11-11); testing keeps only the index. A frame is
 * asked for whole, so its bytes come back as base64. Nothing of the
 * phone's is sent. What the screen makes of each answer is
 * `lib/studio-clips`'s, its one caller.
 */
import { frameName } from "@some-ui/video-render"

import { homeLink } from "./index"
import type { Asked } from "./while-busy"
import { asked } from "./while-busy"

/** Where home serves a frame: by its name alone within its side. */
export const clipFramePath = (
  id: string,
  side: "before" | "after",
  file: string
): string =>
  `/clips/${[id, side, frameName(file)].map(encodeURIComponent).join("/")}`

/**
 * Asks home once for one frame of clip `id`, in a run of the link of its own,
 * so the person's own sends go between frames; never rejects.
 */
export function askClipFrame(
  id: string,
  side: "before" | "after",
  file: string
): Promise<Asked> {
  return asked(() =>
    homeLink().keep((send) =>
      send("GET", clipFramePath(id, side, file), undefined, "whole")
    )
  )
}
