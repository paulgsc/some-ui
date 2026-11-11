/**
 * @vitest-environment node
 *
 * A side's frames from home: asked in one run of the link, in order, so they
 * never queue against each other or keep the person's own sends waiting; and
 * no longer asked once the page doesn't show the side.
 */
import type { HomeCall } from "@some-ui/core-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { askClipSide } from "@/lib/home-link/clips"
import { readClipSide } from "@/lib/studio-clips/read"

const link = vi.hoisted(() => ({
  keep: vi.fn(),
  paired: vi.fn(() => true),
}))

vi.mock("@/lib/home-link/index", () => ({
  homeLink: (): { keep: typeof link.keep } => ({ keep: link.keep }),
  paired: link.paired,
}))

beforeEach(() => {
  link.keep.mockReset()
})

describe("a side's frames", () => {
  it("are asked in one run of the link, one after another, each whole", async () => {
    const sent: Array<Parameters<HomeCall>> = []
    link.keep.mockImplementation(
      async (run: (send: HomeCall) => Promise<unknown>) => ({
        kind: "done",
        value: await run((...call) => {
          sent.push(call)
          return Promise.resolve({ status: 200, body: "iVBORw0KGgo=" })
        }),
      })
    )
    const files = Array.from({ length: 12 }, (_, i) => `after/${String(i)}.png`)
    const asked = await askClipSide("c", "after", files)
    expect(link.keep).toHaveBeenCalledTimes(1)
    expect(sent.map(([, path]) => path)).toEqual(
      files.map((_, i) => `/clips/c/after/${String(i)}.png`)
    )
    expect(
      sent.every(([method, , , range]) => method === "GET" && range === "whole")
    ).toBe(true)
    expect(asked.kind === "answered" && asked.answers).toHaveLength(12)
  })

  it("read as busy while the link runs something else", async () => {
    link.keep.mockResolvedValue(null)
    expect(await askClipSide("c", "after", ["after/01.png"])).toEqual({
      kind: "busy",
    })
  })

  it("are asked no more once the page doesn't show them", async () => {
    link.keep.mockResolvedValue(null)
    const shown = await readClipSide(
      "c",
      "after",
      ["after/01.png"],
      () => false
    )
    expect(link.keep).not.toHaveBeenCalled()
    expect(shown).toEqual([{ kind: "away" }])
  })
})
