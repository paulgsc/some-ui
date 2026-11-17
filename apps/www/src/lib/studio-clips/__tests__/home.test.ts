/**
 * A clip's frames from home (`../home`): a clip missing any frame (home was
 * away, say) is asked again on the next visit, under the app's query
 * defaults that keep every other answer across visits (HERD2).
 */
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import type { FrameShown } from "@/lib/studio-clips/frames"
import { clipFramesQuery } from "@/lib/studio-clips/home"

const answers = vi.hoisted((): Array<ReadonlyArray<FrameShown>> => [])
vi.mock("@/lib/studio-clips/frames-read", () => ({
  readClipFrames: vi.fn(
    (): Promise<ReadonlyArray<FrameShown>> =>
      Promise.resolve(answers.shift() ?? [])
  ),
}))

const FRAMES = [{ side: "before", file: "a.png" }] as const

/** One visit to the clip's page: its frames once read. */
async function visit(client: QueryClient): Promise<unknown> {
  const observer = new QueryObserver(client, clipFramesQuery("c1", FRAMES))
  const stop = observer.subscribe(() => undefined)
  await vi.waitFor(() =>
    expect(observer.getCurrentResult().isFetching).toBe(false)
  )
  stop()
  return observer.getCurrentResult().data
}

describe("a clip's frames from home (HERD2)", () => {
  // The app's own defaults (`providers/tanstack-query`).
  const appClient = (): QueryClient =>
    new QueryClient({
      defaultOptions: {
        queries: { staleTime: 15 * 60 * 1000, refetchOnMount: false },
      },
    })

  it("asks again on the next visit when home was away, and keeps whole frames", async () => {
    const client = appClient()
    answers.push([{ kind: "away" }], [{ kind: "frame", src: "blob:a" }])
    expect(await visit(client)).toEqual([{ kind: "away" }])
    expect(await visit(client)).toEqual([{ kind: "frame", src: "blob:a" }])
    // Whole now: the next visit keeps it, asking nothing.
    answers.push([{ kind: "away" }])
    expect(await visit(client)).toEqual([{ kind: "frame", src: "blob:a" }])
  })
})
