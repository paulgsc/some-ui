/**
 * Studio's clips (SFEED7, epic #2670 decision 5): the Library, every clip
 * listed in paulgsc/testing, read when Clips opens and on Try again
 * (`./read`), and kept for a minute so a clip's page opened from the list
 * shows at once. Each frame is read from home when its page shows it
 * (`clipFrameQuery`); one home holds is kept for the page load.
 */
import { queryOptions } from "@tanstack/react-query"

import type { FrameShown } from "./frames"
import { readClipFrame, readStudioClips } from "./read"

export type { FrameShown } from "./frames"

export const studioClipsQuery = queryOptions({
  queryKey: ["studio", "clips"],
  queryFn: readStudioClips,
  staleTime: 60_000,
  retry: false,
})

type FrameSide = "before" | "after"

const frameKey = (id: string, side: FrameSide, file: string) =>
  ["studio", "clip-frame", id, side, file] as const

type FrameQueryOptions = ReturnType<
  typeof queryOptions<
    FrameShown,
    Error,
    FrameShown,
    ReturnType<typeof frameKey>
  >
>

/** One frame of clip `id`, from home, read when its page shows it. */
export const clipFrameQuery = (
  id: string,
  side: FrameSide,
  file: string
): FrameQueryOptions =>
  queryOptions({
    queryKey: frameKey(id, side, file),
    queryFn: (): Promise<FrameShown> => readClipFrame(id, side, file),
    // A frame home holds never changes; anything else is asked again on
    // the next visit.
    staleTime: (query) => (query.state.data?.kind === "frame" ? Infinity : 0),
    retry: false,
  })
