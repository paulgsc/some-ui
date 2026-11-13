/**
 * A clip's frames, read from home (`lib/home-link/clips`): the Android app's
 * only (`build.paths.ts`). One frame at a time, each in a run of the link of
 * its own, as a video comes a part at a time (`lib/call-videos/parts`): the
 * person's own sends go between frames, a frame that fails fails alone, and
 * the read stops at the next frame once the page no longer shows the clip.
 * When it is read is `./home`'s query.
 */
import { askClipFrame } from "@/lib/home-link/clips"
import { askWhileBusy } from "@/lib/home-link/while-busy"

import type { FrameShown } from "./frames"
import { readFrame } from "./frames"

/** A frame of a clip, by its side and its file in the index. */
export type ClipFrameRef = {
  readonly side: "before" | "after"
  readonly file: string
}

/**
 * Every frame of clip `id` in `frames`, from home, in their order; never
 * rejects. A frame left unread once `wanted` says no is `away`.
 */
export async function readClipFrames(
  id: string,
  frames: ReadonlyArray<ClipFrameRef>,
  wanted: () => boolean
): Promise<ReadonlyArray<FrameShown>> {
  const shown: Array<FrameShown> = []
  for (const { side, file } of frames) {
    if (!wanted()) {
      shown.push({ kind: "away" })
      continue
    }
    const asked = await askWhileBusy(() => askClipFrame(id, side, file), wanted)
    shown.push(
      asked.kind === "answered"
        ? readFrame(asked.answer)
        : asked.kind === "unpaired"
          ? asked
          : { kind: "away" }
    )
  }
  return shown
}
