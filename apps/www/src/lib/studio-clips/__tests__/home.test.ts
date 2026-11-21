/**
 * A clip's frames from home (`../home`): each frame shows as home answers it
 * (#2895); a clip with a frame asking again could change (home was away, a
 * walk's frame not made yet) is asked again on the next visit, under the
 * app's query defaults that keep every other answer across visits (HERD2);
 * one whose every frame is settled is kept (#2895).
 */
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import type { FrameShown } from "@/lib/studio-clips/frames"
import type { ClipFrameRef, FrameRead } from "@/lib/studio-clips/frames-read"
import { clipFramesQuery } from "@/lib/studio-clips/home"

/** Each visit's answers, a frame each, in order; a gate, when set, holds the second. */
const visits = vi.hoisted(
  (): {
    answers: Array<ReadonlyArray<FrameShown>>
    gate: Promise<void> | null
  } => ({ answers: [], gate: null })
)
vi.mock("@/lib/studio-clips/frames-read", () => ({
  clipFrames: vi.fn(async function* (): AsyncGenerator<FrameRead> {
    const answers = visits.answers.shift() ?? []
    for (const [at, shown] of answers.entries()) {
      if (at === 1 && visits.gate !== null) await visits.gate
      yield { at, shown }
    }
  }),
}))

const SESSION: ReadonlyArray<ClipFrameRef> = [
  { side: "before", file: "a.png", made: "session" },
]
const WALK: ReadonlyArray<ClipFrameRef> = [
  { side: "after", file: "a.png", made: "walk" },
]
const FRAME: FrameShown = { kind: "frame", src: "data:image/png;base64,AA==" }

/** One visit to the clip's page: its frames once read. */
async function visit(
  client: QueryClient,
  frames: ReadonlyArray<ClipFrameRef> = SESSION
): Promise<unknown> {
  const observer = new QueryObserver(client, clipFramesQuery("c1", frames))
  const stop = observer.subscribe(() => undefined)
  await vi.waitFor(() =>
    expect(observer.getCurrentResult().isFetching).toBe(false)
  )
  stop()
  return observer.getCurrentResult().data
}

// The app's own defaults (`providers/tanstack-query`).
const appClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15 * 60 * 1000, refetchOnMount: false },
    },
  })

describe("a clip's frames from home (HERD2, #2895)", () => {
  it("asks again on the next visit when home was away, and keeps whole frames", async () => {
    const client = appClient()
    visits.answers.push([{ kind: "away" }], [FRAME])
    expect(await visit(client)).toEqual([{ kind: "away" }])
    expect(await visit(client)).toEqual([FRAME])
    // Whole now: the next visit keeps it, asking nothing.
    visits.answers.push([{ kind: "away" }])
    expect(await visit(client)).toEqual([FRAME])
    visits.answers.length = 0
  })

  it("keeps a session's frame home doesn't hold, which no visit can change", async () => {
    const client = appClient()
    visits.answers.push([{ kind: "not-taken" }], [FRAME])
    expect(await visit(client)).toEqual([{ kind: "not-taken" }])
    expect(await visit(client)).toEqual([{ kind: "not-taken" }])
    visits.answers.length = 0
  })

  it("asks again for a walk's frame home hasn't made yet", async () => {
    const client = appClient()
    visits.answers.push([{ kind: "not-taken" }], [FRAME])
    expect(await visit(client, WALK)).toEqual([{ kind: "not-taken" }])
    expect(await visit(client, WALK)).toEqual([FRAME])
  })

  it("shows each frame as home answers it, before the rest have come", async () => {
    const client = appClient()
    const two = [
      ...SESSION,
      { side: "after", file: "b.png", made: "session" },
    ] as const
    let open = (): void => undefined
    visits.gate = new Promise((resolve) => {
      open = resolve
    })
    visits.answers.push([FRAME, FRAME])
    const observer = new QueryObserver(client, clipFramesQuery("c2", two))
    const stop = observer.subscribe(() => undefined)
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data).toEqual([FRAME])
    )
    expect(observer.getCurrentResult().isFetching).toBe(true)
    open()
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().isFetching).toBe(false)
    )
    expect(observer.getCurrentResult().data).toEqual([FRAME, FRAME])
    stop()
    visits.gate = null
  })
})
