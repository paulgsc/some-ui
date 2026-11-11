/**
 * A clip's frame on home (paulgsc/server `routes::clips`), through the link:
 * `GET /clips/:id/:side/:file`, the frame's PNG as home made or kept it, by
 * its file name within the side (`frameName`). Home keeps Studio's clip
 * frames (owner, 2026-11-11); testing keeps only the index. A frame is
 * asked for whole, so its bytes come back as base64. Nothing of the
 * phone's is sent. What the screen makes of each answer is
 * `lib/studio-clips`'s, its one caller.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { frameName } from "@some-ui/video-render"

import { homeLink, paired } from "./index"
import type { NotAnswered } from "./while-busy"

/** Where home serves a frame: by its name alone within its side. */
export const clipFramePath = (
  id: string,
  side: "before" | "after",
  file: string
): string =>
  `/clips/${[id, side, frameName(file)].map(encodeURIComponent).join("/")}`

/** Home's answer for each of a side's frames, in order, or why there is none. */
export type SideAsked =
  | { readonly kind: "answered"; readonly answers: ReadonlyArray<HomeAnswer> }
  | NotAnswered

/**
 * Asks home once for every frame of one side of clip `id`, one after another
 * in a single run of the link, so a side's frames never queue against each
 * other or keep the person's own sends waiting turn after turn; never
 * rejects.
 */
export async function askClipSide(
  id: string,
  side: "before" | "after",
  files: ReadonlyArray<string>
): Promise<SideAsked> {
  if (!paired()) return { kind: "unpaired" }
  try {
    const outcome = await homeLink().keep(async (send) => {
      const answers: Array<HomeAnswer> = []
      for (const file of files)
        answers.push(
          await send("GET", clipFramePath(id, side, file), undefined, "whole")
        )
      return answers
    })
    return outcome?.kind === "done"
      ? { kind: "answered", answers: outcome.value }
      : { kind: "busy" }
  } catch {
    return { kind: "unreachable" }
  }
}
