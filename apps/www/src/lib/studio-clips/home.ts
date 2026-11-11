/**
 * A clip's frames from home (owner, 2026-11-11), the Android app's only:
 * each side's frames read together through the paired link
 * (`lib/home-link/clips`), when the clip's page shows the side. A side whose
 * frames home all holds is kept for the page load; one missing any is asked
 * again on the next visit. Phone-only (`build.paths.ts`).
 */
import { queryOptions } from "@tanstack/react-query"

import type { FrameShown } from "./frames"
import { readClipSide } from "./side-read"

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
    staleTime: (query) =>
      query.state.data?.every((f) => f.kind === "frame") === true
        ? Infinity
        : 0,
    retry: false,
  })
