/**
 * A clip's frames from home (owner, 2026-11-11), the Android app's only:
 * a clip's frames read one at a time through the paired link
 * (`./frames-read`), while the clip's page shows them. A clip whose frames
 * home all holds is kept for the page load; one missing any is asked again
 * on the next visit. Phone-only (`build.paths.ts`).
 */
import { queryOptions } from "@tanstack/react-query"

import type { FrameShown } from "./frames"
import type { ClipFrameRef } from "./frames-read"
import { readClipFrames } from "./frames-read"

const framesKey = (id: string, frames: ReadonlyArray<ClipFrameRef>) =>
  [
    "studio",
    "clip-frames",
    id,
    ...frames.map(({ side, file }) => `${side}:${file}`),
  ] as const

type FramesQueryOptions = ReturnType<
  typeof queryOptions<
    ReadonlyArray<FrameShown>,
    Error,
    ReadonlyArray<FrameShown>,
    ReturnType<typeof framesKey>
  >
>

/** Every frame of clip `id`, from home, read while its page shows it. */
export const clipFramesQuery = (
  id: string,
  frames: ReadonlyArray<ClipFrameRef>
): FramesQueryOptions =>
  queryOptions({
    queryKey: framesKey(id, frames),
    queryFn: ({ signal }): Promise<ReadonlyArray<FrameShown>> =>
      readClipFrames(id, frames, () => !signal.aborted),
    staleTime: (query) =>
      query.state.data?.every((f) => f.kind === "frame") === true
        ? Infinity
        : 0,
    retry: false,
  })
