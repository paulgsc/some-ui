/**
 * A side of a clip's frames, read from home (`lib/home-link/clips`): the
 * Android app's only (`build.paths.ts`). When it is read is `./home`'s query.
 */
import { askClipSide } from "@/lib/home-link/clips"
import { askWhileBusy } from "@/lib/home-link/while-busy"

import type { FrameShown } from "./frames"
import { readFrame } from "./frames"

/**
 * Every frame of one side of clip `id`, from home, in the order of `files`;
 * never rejects. Asked again while the link is busy, until `wanted` says the
 * page no longer shows the side.
 */
export async function readClipSide(
  id: string,
  side: "before" | "after",
  files: ReadonlyArray<string>,
  wanted: () => boolean
): Promise<ReadonlyArray<FrameShown>> {
  const asked = await askWhileBusy(() => askClipSide(id, side, files), wanted)
  if (asked.kind !== "answered") {
    const none: FrameShown =
      asked.kind === "unpaired" ? asked : { kind: "away" }
    return files.map(() => none)
  }
  return asked.answers.map(readFrame)
}
