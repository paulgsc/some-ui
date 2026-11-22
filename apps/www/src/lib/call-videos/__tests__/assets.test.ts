/**
 * @vitest-environment node
 *
 * An episode's files beside its video (ASSETS-R, C1300; its chapters,
 * SFEED4): every answer home can give to a read of each file, every state its
 * list can say of one, and every answer to an ask that home make one.
 */
import { ASSET_MADE, isAloneAsset } from "@some-ui/video-render/assets"
import { describe, expect, it } from "vitest"

import type {
  AssetRead,
  AssetState,
  ShownAsset,
} from "@/lib/call-videos/assets"
import {
  AssetsSchema,
  assetView,
  readAsset,
  readProduced,
  SHOWN_ASSETS,
} from "@/lib/call-videos/assets"

const STATES: ReadonlyArray<AssetState | undefined> = [
  undefined,
  "present",
  "missing",
  "queued",
  "running",
  "failed",
]

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
  it("shows a file home sent, whatever its list says", () => {
    const there: AssetRead<"thumbnail"> = {
      kind: "there",
      content: { base64: "iVBORw0K" },
    }
    for (const state of STATES)
      expect(assetView("thumbnail", there, state)).toEqual(there)
  })

  it("shows nothing while a file is read, or where home's answer didn't read", () => {
    for (const asset of SHOWN_ASSETS)
      for (const state of STATES) {
        expect(assetView(asset, undefined, state)).toEqual({ kind: "hidden" })
        expect(assetView(asset, { kind: "unreadable" }, state)).toEqual({
          kind: "hidden",
        })
      }
  })

  it("says what a file home holds none of is doing, by the list", () => {
    const none = { kind: "none" } as const
    const expected = (
      asset: ShownAsset,
      state: AssetState | undefined
    ): ReturnType<typeof assetView> => {
      if (state === undefined || state === "present") return { kind: "hidden" }
      if (state === "missing")
        return {
          kind: "missing",
          generate: isAloneAsset(asset) ? asset : null,
        }
      if (state === "failed") return { kind: "failed" }
      return { kind: "asked" }
    }
    for (const asset of SHOWN_ASSETS)
      for (const state of STATES)
        expect(assetView(asset, none, state)).toEqual(expected(asset, state))
  })

  it("offers Generate for the thumbnail alone: chapters come with the video", () => {
    expect(assetView("thumbnail", { kind: "none" }, "missing")).toEqual({
      kind: "missing",
      generate: "thumbnail",
    })
    expect(assetView("description", { kind: "none" }, "missing")).toEqual({
      kind: "missing",
      generate: null,
    })
  })
})

describe("isAloneAsset", () => {
  it("names exactly the files a render's table says home makes alone", () => {
    for (const asset of SHOWN_ASSETS)
      expect(isAloneAsset(asset)).toBe(ASSET_MADE[asset] === "alone")
  })
})

describe("AssetsSchema", () => {
  it("takes any of the files, each in a state, and refuses another state", () => {
    expect(AssetsSchema.safeParse({}).success).toBe(true)
    expect(
      AssetsSchema.safeParse({ thumbnail: "missing", video: "present" }).success
    ).toBe(true)
    expect(AssetsSchema.safeParse({ thumbnail: "lost" }).success).toBe(false)
  })
})

describe("readProduced", () => {
  it("reads home taking the ask, an older home, and anything else", () => {
    expect(readProduced({ status: 202, body: "{}" })).toEqual({ kind: "asked" })
    expect(readProduced({ status: 200, body: "{}" })).toEqual({ kind: "asked" })
    expect(readProduced({ status: 404, body: "" })).toEqual({ kind: "older" })
    expect(readProduced({ status: 405, body: "" })).toEqual({ kind: "older" })
    expect(readProduced({ status: 500, body: "" })).toEqual({
      kind: "unreadable",
    })
  })
})
