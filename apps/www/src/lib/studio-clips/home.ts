/**
 * A clip's frames from home (owner, 2026-11-11), the Android app's only:
 * a clip's frames read one at a time through the paired link
 * (`./frames-read`), while the clip's page shows them, each shown as home
 * answers it (#2895), through TanStack's own `streamedQuery` (C947). A visit
 * after the first puts each new answer in its frame's place, so what showed
 * stays until home answers again. A clip whose every frame is settled
 * (`settled`: a frame, or one a session took and home didn't keep) is kept
 * for the page load; one with any other is asked again on the next visit.
 * Phone-only (`build.paths.ts`).
 */
import {
  queryOptions,
  experimental_streamedQuery as streamedQuery,
} from "@tanstack/react-query"

import type { FrameShown } from "./frames"
import { placeFrame, settled } from "./frames"
import type { ClipFrameRef, FrameRead } from "./frames-read"
import { clipFrames } from "./frames-read"

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

const NONE: ReadonlyArray<FrameShown> = []

/** Whether every frame of `frames` has an answer asking again can't change. */
function allSettled(
  shown: ReadonlyArray<FrameShown> | undefined,
  frames: ReadonlyArray<ClipFrameRef>
): boolean {
  return (
    shown?.length === frames.length &&
    frames.every((frame, i) => {
      // A frame not answered yet (a read the page left) has none.
      const answer = shown.at(i)
      return answer !== undefined && settled(answer, frame.made)
    })
  )
}

/** Every frame of clip `id`, from home, read while its page shows it. */
export const clipFramesQuery = (
  id: string,
  frames: ReadonlyArray<ClipFrameRef>
): FramesQueryOptions =>
  queryOptions({
    queryKey: framesKey(id, frames),
    queryFn: streamedQuery<
      FrameRead,
      ReadonlyArray<FrameShown>,
      ReturnType<typeof framesKey>
    >({
      streamFn: ({ signal }) => clipFrames(id, frames, () => !signal.aborted),
      // Each answer goes in its frame's place over the last visit's.
      refetchMode: "append",
      reducer: (shown, { at, shown: frame }) => placeFrame(shown, at, frame),
      initialValue: NONE,
    }),
    staleTime: (query) => (allSettled(query.state.data, frames) ? Infinity : 0),
    // The app's queries keep their answer across visits (`refetchOnMount`
    // false, `providers/tanstack-query`); this one asks again on the next
    // visit whenever its `staleTime` says, so frames home was away for are
    // not kept until the app restarts (HERD2).
    refetchOnMount: true,
    retry: false,
  })
