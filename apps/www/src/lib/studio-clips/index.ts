/**
 * Studio's clips (SFEED7, epic #2670 decision 5): the Library, every clip
 * listed in paulgsc/testing, read when Clips opens and on Try again
 * (`./read`), and kept for a minute so a clip's page opened from the list
 * shows at once. A side's frames are read from home together when its page
 * shows it (`clipSideQuery`); frames home holds are kept for the page load.
 */
import { queryOptions } from "@tanstack/react-query"

import type { FrameShown } from "./frames"
import { readClipSide, readStudioClips } from "./read"

export type { FrameShown } from "./frames"

export const studioClipsQuery = queryOptions({
  queryKey: ["studio", "clips"],
  queryFn: readStudioClips,
  staleTime: 60_000,
  retry: false,
})

type FrameSide = "before" | "after"

const sideKey = (id: string, side: FrameSide, files: ReadonlyArray<string>) =>
  ["studio", "clip-side", id, side, ...files] as const

type SideQueryOptions = ReturnType<
  typeof queryOptions<
    ReadonlyArray<FrameShown>,
    Error,
    ReadonlyArray<FrameShown>,
    ReturnType<typeof sideKey>
  >
>

/** Every frame of one side of clip `id`, from home, read when its page shows it. */
export const clipSideQuery = (
  id: string,
  side: FrameSide,
  files: ReadonlyArray<string>
): SideQueryOptions =>
  queryOptions({
    queryKey: sideKey(id, side, files),
    queryFn: ({ signal }): Promise<ReadonlyArray<FrameShown>> =>
      readClipSide(id, side, files, () => !signal.aborted),
    // Frames home holds never change; a side missing any is asked again on
    // the next visit.
    staleTime: (query) =>
      query.state.data?.every((f) => f.kind === "frame") === true
        ? Infinity
        : 0,
    retry: false,
  })
