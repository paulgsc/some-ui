/**
 * @vitest-environment node
 *
 * A clip's frames from home: one at a time, each in a run of the link of its
 * own, so the person's sends go between them; each handed on as it comes, in
 * its place; a frame that fails fails alone;
 * a busy link is asked again; and nothing more is asked once the page no
 * longer shows the clip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { askClipFrame } from "@/lib/home-link/clips"
import type { FrameShown } from "@/lib/studio-clips/frames"
import type { ClipFrameRef } from "@/lib/studio-clips/frames-read"
import { clipFrames } from "@/lib/studio-clips/frames-read"

vi.mock("@/lib/home-link/clips", () => ({ askClipFrame: vi.fn() }))

const PNG = "iVBORw0KGgo="
const held = { kind: "answered", answer: { status: 200, body: PNG } } as const
const frames: ReadonlyArray<ClipFrameRef> = [
  { side: "before", file: "before/01.png", made: "session" },
  { side: "after", file: "after/01.png", made: "walk" },
  { side: "after", file: "after/02.png", made: "walk" },
]
const always = (): boolean => true

/** Every frame the read hands on, checking each comes in its own place. */
async function readClipFrames(
  id: string,
  which: ReadonlyArray<ClipFrameRef>,
  wanted: () => boolean
): Promise<Array<FrameShown>> {
  const shown: Array<FrameShown> = []
  for await (const { at, shown: frame } of clipFrames(id, which, wanted)) {
    expect(at).toBe(shown.length)
    shown.push(frame)
  }
  return shown
}

beforeEach(() => {
  vi.mocked(askClipFrame).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("a clip's frames", () => {
  it("are asked one at a time, in order, and shown as home answered", async () => {
    vi.mocked(askClipFrame).mockResolvedValue(held)
    const shown = await readClipFrames("c", frames, always)
    expect(vi.mocked(askClipFrame).mock.calls).toEqual([
      ["c", "before", "before/01.png"],
      ["c", "after", "after/01.png"],
      ["c", "after", "after/02.png"],
    ])
    expect(shown.map((f) => f.kind)).toEqual(["frame", "frame", "frame"])
  })

  it("leave out a frame already settled, asking only the rest", async () => {
    vi.mocked(askClipFrame).mockResolvedValue(held)
    const read: Array<number> = []
    for await (const { at } of clipFrames(
      "c",
      frames,
      always,
      (at) => at !== 1
    ))
      read.push(at)
    expect(read).toEqual([0, 2])
    expect(askClipFrame).toHaveBeenCalledTimes(2)
  })

  it("hand each frame on before the next is asked", async () => {
    vi.mocked(askClipFrame).mockResolvedValue(held)
    const reading = clipFrames("c", frames, always)
    expect((await reading.next()).value).toEqual({
      at: 0,
      shown: { kind: "frame", src: `data:image/png;base64,${PNG}` },
    })
    expect(askClipFrame).toHaveBeenCalledTimes(1)
    await reading.return(undefined)
  })

  it("fail alone: a frame home didn't answer leaves the others as they came", async () => {
    vi.mocked(askClipFrame)
      .mockResolvedValueOnce(held)
      .mockResolvedValueOnce({ kind: "unreachable" })
      .mockResolvedValueOnce(held)
    const shown = await readClipFrames("c", frames, always)
    expect(shown.map((f) => f.kind)).toEqual(["frame", "away", "frame"])
  })

  it("ask again while the link runs something else", async () => {
    vi.useFakeTimers()
    vi.mocked(askClipFrame)
      .mockResolvedValueOnce({ kind: "busy" })
      .mockResolvedValue(held)
    const reading = readClipFrames("c", frames.slice(0, 1), always)
    await vi.advanceTimersByTimeAsync(1_000)
    expect((await reading).map((f) => f.kind)).toEqual(["frame"])
    expect(askClipFrame).toHaveBeenCalledTimes(2)
  })

  it("are asked no more once the page doesn't show the clip", async () => {
    // The page goes while home answers the first frame.
    let showing = true
    vi.mocked(askClipFrame).mockImplementation(() => {
      showing = false
      return Promise.resolve(held)
    })
    const shown = await readClipFrames("c", frames, () => showing)
    expect(askClipFrame).toHaveBeenCalledTimes(1)
    expect(shown.map((f) => f.kind)).toEqual(["frame", "away", "away"])
  })
})
