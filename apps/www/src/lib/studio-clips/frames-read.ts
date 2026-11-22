/**
 * A clip's frames, read from home (`lib/home-link/clips`): the Android app's
 * only (`build.paths.ts`). One frame at a time, each in a run of the link of
 * its own, as a video comes a part at a time (`lib/call-videos/parts`): the
 * person's own sends go between frames, a frame that fails fails alone, and
 * the read stops at the next frame once the page no longer shows the clip.
 * Each frame is handed on as home answers it, so the page shows it then
 * (#2895). When it is read is `./home`'s query.
 */
import type { ClipSide } from "@some-ui/video-render"

import { askClipFrame } from "@/lib/home-link/clips"
import { askWhileBusy } from "@/lib/home-link/while-busy"

import type { FrameShown } from "./frames"
import { readFrame } from "./frames"

/** A frame of a clip, by its side and its file in the index, and how its side was made. */
export type ClipFrameRef = {
  readonly side: "before" | "after"
  readonly file: string
  readonly made: ClipSide["made"]
}

/** One frame as home answered it, at its place in the clip's frames. */
export type FrameRead = { readonly at: number; readonly shown: FrameShown }

/**
 * Every frame of clip `id` in `frames`, from home, in their order, each as
 * home answers it; never throws. A frame not asked once `wanted` says no is
 * `away`; one whose ask stopped while the link was busy is `busy`, as
 * `askWhileBusy` ends an ask no longer wanted (#3155). A frame `ask` says
 * no to (one already settled) is neither asked nor handed on (#2895).
 */
export async function* clipFrames(
  id: string,
  frames: ReadonlyArray<ClipFrameRef>,
  wanted: () => boolean,
  ask: (at: number) => boolean = () => true
): AsyncGenerator<FrameRead> {
  for (const [at, { side, file }] of frames.entries()) {
    if (!ask(at)) continue
    if (!wanted()) {
      yield { at, shown: { kind: "away" } }
      continue
    }
    const asked = await askWhileBusy(() => askClipFrame(id, side, file), wanted)
    yield {
      at,
      shown:
        asked.kind === "answered"
          ? readFrame(asked.answer)
          : asked.kind === "unreachable"
            ? { kind: "away" }
            : asked,
    }
  }
}
