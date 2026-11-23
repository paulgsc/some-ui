/**
 * @vitest-environment node
 *
 * An episode's files beside its video (ASSETS-R, C1300; its chapters,
 * SFEED4): every answer home can give to a read of each file, every step its
 * list can say of one, and every answer to an ask that home make one.
 */
import { ASSET_MADE, isAloneAsset } from "@some-ui/video-render/assets"
import { describe, expect, it } from "vitest"

import type { AssetRead, Step, StepState } from "@/lib/call-videos/assets"
import {
  AssetsSchema,
  assetView,
  latestStep,
  readAsset,
  readProduced,
  SHOWN_ASSETS,
  STEP_STATES,
} from "@/lib/call-videos/assets"

const step = (state: StepState, over: Partial<Step> = {}): Step => ({
  asset: "thumbnail",
  state,
  ...over,
})

describe("readAsset", () => {
  it("reads home's chapters, none when it has none, and refuses anything else", () => {
    expect(
      readAsset("description", {
        status: 200,
        body: "0:00 Opening\n0:20 The board",
      })
    ).toEqual({
      kind: "there",
      content: { text: "0:00 Opening\n0:20 The board\n" },
    })
    expect(readAsset("description", { status: 404, body: "" })).toEqual({
      kind: "none",
    })
    expect(readAsset("description", { status: 200, body: "  " })).toEqual({
      kind: "none",
    })
    expect(readAsset("description", { status: 500, body: "" })).toEqual({
      kind: "unreadable",
    })
  })

  it("reads a thumbnail's bytes as base64, none when there are none", () => {
    expect(readAsset("thumbnail", { status: 200, body: "iVBORw0K" })).toEqual({
      kind: "there",
      content: { base64: "iVBORw0K" },
    })
    expect(readAsset("thumbnail", { status: 200, body: "" })).toEqual({
      kind: "none",
    })
    expect(readAsset("thumbnail", { status: 404, body: "" })).toEqual({
      kind: "none",
    })
    expect(readAsset("thumbnail", { status: 503, body: "" })).toEqual({
      kind: "unreadable",
    })
  })
})

describe("assetView", () => {
  const steps = [undefined, ...STEP_STATES.map((state) => step(state))]

  it("shows a file home sent, whatever its step says", () => {
    const there: AssetRead<"thumbnail"> = {
      kind: "there",
      content: { base64: "iVBORw0K" },
    }
    for (const s of steps)
      expect(assetView("thumbnail", there, s)).toEqual(there)
  })

  it("shows nothing while a file is read, or where home's answer didn't read", () => {
    for (const asset of SHOWN_ASSETS)
      for (const s of steps) {
        expect(assetView(asset, undefined, s)).toEqual({ kind: "hidden" })
        expect(assetView(asset, { kind: "unreadable" }, s)).toEqual({
          kind: "hidden",
        })
      }
  })

  it("draws a file home holds none of by its step: every state", () => {
    const none = { kind: "none" } as const
    for (const asset of SHOWN_ASSETS) {
      expect(assetView(asset, none, undefined)).toEqual({ kind: "hidden" })
      for (const state of STEP_STATES) {
        const s = step(state)
        const view = assetView(asset, none, s)
        if (state === "missing")
          expect(view).toEqual({
            kind: "missing",
            generate: isAloneAsset(asset) ? asset : null,
          })
        else expect(view).toEqual({ kind: "line", step: s })
      }
    }
  })

  it("offers Generate for the thumbnail alone: chapters come with the video", () => {
    expect(assetView("thumbnail", { kind: "none" }, step("missing"))).toEqual({
      kind: "missing",
      generate: "thumbnail",
    })
    expect(assetView("description", { kind: "none" }, step("missing"))).toEqual(
      { kind: "missing", generate: null }
    )
  })
})

describe("latestStep", () => {
  it("takes the answer to Generate until the list has moved past not made", () => {
    const asked = step("asked", { askedAt: "2026-11-22T23:05:00Z" })
    expect(latestStep(undefined, null)).toBeUndefined()
    expect(latestStep(undefined, asked)).toEqual(asked)
    expect(latestStep(step("missing"), asked)).toEqual(asked)
    expect(latestStep(step("waiting"), null)).toEqual(step("waiting"))
  })

  it("keeps a time only the earlier step carries", () => {
    const asked = step("waiting", {
      askedAt: "2026-11-22T23:05:00Z",
      startedAt: "2026-11-22T23:06:00Z",
    })
    expect(
      latestStep(step("done", { endedAt: "2026-11-22T23:08:00Z" }), asked)
    ).toEqual(
      step("done", {
        askedAt: "2026-11-22T23:05:00Z",
        startedAt: "2026-11-22T23:06:00Z",
        endedAt: "2026-11-22T23:08:00Z",
      })
    )
    // The list's own time wins over the earlier answer's.
    expect(
      latestStep(
        step("rendering", { startedAt: "2026-11-22T23:07:00Z" }),
        asked
      )?.startedAt
    ).toBe("2026-11-22T23:07:00Z")
  })
})

describe("isAloneAsset", () => {
  it("names exactly the files a render's table says home makes alone", () => {
    for (const asset of SHOWN_ASSETS)
      expect(isAloneAsset(asset)).toBe(ASSET_MADE[asset] === "alone")
  })
})

describe("AssetsSchema", () => {
  it("takes any of the files, each a step, and drops a step it can't read", () => {
    expect(AssetsSchema.safeParse({}).success).toBe(true)
    expect(
      AssetsSchema.safeParse({
        thumbnail: { asset: "thumbnail", state: "waiting", askedAt: "x" },
        video: { asset: "video", state: "done" },
      }).success
    ).toBe(true)
    // A step this phone can't read drops alone, never the rest.
    expect(
      AssetsSchema.parse({
        thumbnail: { asset: "thumbnail", state: "lost" },
        video: { asset: "video", state: "done" },
      })
    ).toEqual({ video: { asset: "video", state: "done" } })
    expect(AssetsSchema.parse("not steps")).toEqual({})
  })
})

describe("readProduced", () => {
  const body = (s: Step): string => JSON.stringify(s)

  it("reads home's step on taking the ask, having the file, or stopping", () => {
    for (const [status, s] of [
      [202, step("waiting", { askedAt: "2026-11-22T23:05:00Z" })],
      [200, step("done")],
      [409, step("failed", { reason: "recorder" })],
    ] as const)
      expect(readProduced("thumbnail", { status, body: body(s) })).toEqual({
        kind: "step",
        step: s,
      })
  })

  it("refuses a step of another file than the one asked for", () => {
    expect(
      readProduced("thumbnail", {
        status: 202,
        body: body({ asset: "video", state: "waiting" }),
      })
    ).toEqual({ kind: "unreadable" })
  })

  it("reads an episode home doesn't hold, a file it won't make alone, and anything else", () => {
    for (const status of [404, 405, 422])
      expect(readProduced("thumbnail", { status, body: "" })).toEqual({
        kind: "older",
      })
    expect(readProduced("thumbnail", { status: 202, body: "{}" })).toEqual({
      kind: "unreadable",
    })
    expect(readProduced("thumbnail", { status: 500, body: "" })).toEqual({
      kind: "unreadable",
    })
  })
})
