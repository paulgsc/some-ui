/**
 * @vitest-environment node
 *
 * A clip's frames from home: one at a time, each in a run of the link of its
 * own, so the person's sends go between them; a frame that fails fails alone;
 * a busy link is asked again; and nothing more is asked once the page no
 * longer shows the clip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { askClipFrame } from "@/lib/home-link/clips"
import { readClipFrames } from "@/lib/studio-clips/frames-read"

vi.mock("@/lib/home-link/clips", () => ({ askClipFrame: vi.fn() }))

const PNG = "iVBORw0KGgo="
const held = { kind: "answered", answer: { status: 200, body: PNG } } as const
const frames = [
  { side: "before", file: "before/01.png" },
  { side: "after", file: "after/01.png" },
  { side: "after", file: "after/02.png" },
] as const
const always = (): boolean => true

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
