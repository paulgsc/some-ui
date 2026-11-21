import { join } from "node:path"
import { parseCardsEssay } from "@video-render/cards-essay"
import type { CutList } from "@video-render/cut-list"
import { parseCutList } from "@video-render/cut-list"
import { readSeries } from "@video-render/node"
import { resolve } from "@video-render/resolve"
import {
  isSnipId,
  parseSnipsGiven,
  resolveSnips,
  snipIdsOf,
  SNIPS_GIVEN_SCHEMA,
  snipScreen,
} from "@video-render/snip"
import type { SnipRecord, SnipsGiven } from "@video-render/snip"
import { SCREEN_ZOOM } from "@video-render/zoom"
import { describe, expect, it } from "vitest"

import { showcase } from "./showcase"

const SHA = "0123456789ab".padEnd(64, "c")
const PHONE = `web:/rust-rounds-sample:phone:0.1.69:${SHA.slice(0, 12)}`
const APK = `apk:@studio/takes:android:0.1.69:${"d".repeat(12)}`

/** A web phone snip of the Rust Rounds sample, its program boxed, as the capture writes one. */
const phone = (): SnipRecord => ({
  id: PHONE,
  surface: "web",
  build: "release",
  route: "/rust-rounds-sample",
  path: "/rust-rounds-sample",
  viewport: "phone",
  width: 824,
  height: 1830,
  scale: 2,
  regions: [
    { ref: "QM-311:program", box: { x: 16, y: 200, width: 380, height: 300 } },
    { ref: "QM-311:run", box: { x: 16, y: 520, width: 380, height: 120 } },
  ],
  appVersion: "0.1.69",
  module: "Rust Rounds",
  shows: "Rust Rounds",
  description: "Rust Rounds, on a phone browser, with sample data.",
  image: {
    name: "web/phone/rust-rounds-sample-0123456789ab.png",
    kind: "png",
    bytes: 10,
    sha256: SHA,
  },
})

const apk = (): SnipRecord => ({
  ...phone(),
  id: APK,
  surface: "apk",
  route: "@studio/takes",
  path: "@studio/takes",
  viewport: "android",
  width: 1080,
  height: 1920,
  scale: 1,
  regions: [],
  module: "Studio",
  image: {
    name: "apk/android/release-studio~takes-dddddddddddd.png",
    kind: "png",
    bytes: 10,
    sha256: "d".repeat(64),
  },
})

const given = (snips: Array<SnipRecord>): SnipsGiven => {
  const parsed = parseSnipsGiven({ schema: SNIPS_GIVEN_SCHEMA, snips })
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

/** The Rust Scratchpad essay with its second and third scenes showing snips. */
async function withSnips(
  pictures: ReadonlyArray<{ id: string; at?: Array<string> }>
): Promise<CutList> {
  const cut = await showcase("rust-scratchpad")
  const raw = {
    ...cut,
    shots: cut.shots.map((shot, i) => {
      const snip = pictures[i - 1]
      return snip === undefined
        ? shot
        : { ...shot, picture: { kind: "snip", ...snip } }
    }),
  }
  const parsed = parseCardsEssay("rust-scratchpad-2026-11-14", raw)
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

describe("a snip's id (SNIPS1's grammar)", () => {
  it("is surface, path, viewport, app version and the picture's hash", () => {
    expect(isSnipId(PHONE)).toBe(true)
    expect(isSnipId(APK)).toBe(true)
    expect(isSnipId("web:/:desktop:0.1.69:0123456789ab")).toBe(true)
    expect(isSnipId("web:/:desktop:0.1.69:0123")).toBe(false)
    expect(isSnipId("tv:/:desktop:0.1.69:0123456789ab")).toBe(false)
  })

  it("is refused on a record whose picture it isn't", () => {
    const parsed = parseSnipsGiven({
      schema: SNIPS_GIVEN_SCHEMA,
      snips: [
        { ...phone(), image: { ...phone().image, sha256: "e".repeat(64) } },
      ],
    })
    expect(parsed.ok).toBe(false)
  })
})

describe("a snip is a photographed screen (C865)", () => {
  it("reads as a screens/1 screen in CSS pixels, its parts in its own name", () => {
    expect(snipScreen(phone(), "snip-1")).toEqual({
      id: "snip-1",
      file: "web/phone/rust-rounds-sample-0123456789ab.png",
      width: 412,
      height: 915,
      scale: 2,
      viewport: { width: 412, height: 915 },
      regions: [
        {
          ref: "snip-1:QM-311:program",
          box: { x: 16, y: 200, width: 380, height: 300 },
        },
        {
          ref: "snip-1:QM-311:run",
          box: { x: 16, y: 520, width: 380, height: 120 },
        },
      ],
    })
  })
})

describe("an essay's snip scenes (SNIPS4)", () => {
  it("is a cards essay's scene, and names its snips once each", async () => {
    const cut = await withSnips([{ id: APK }, { id: PHONE }, { id: APK }])
    expect(snipIdsOf(cut)).toEqual([APK, PHONE])
  })

  it("is drawn as a still of the whole screen, or zoomed to the parts it names", async () => {
    const cut = await withSnips([
      { id: APK },
      { id: PHONE, at: ["QM-311:program", "QM-311:run"] },
    ])
    const drawn = resolveSnips(cut, given([apk(), phone()]))
    if (!drawn.ok) throw new Error(drawn.problems.join("; "))
    expect(drawn.value.shots[1]?.picture).toEqual({
      kind: "still",
      source: "snips/apk/android/release-studio~takes-dddddddddddd.png",
    })
    const zoom = drawn.value.shots[2]?.picture
    expect(zoom).toMatchObject({
      kind: "composition",
      ref: SCREEN_ZOOM,
      files: ["snips/web/phone/rust-rounds-sample-0123456789ab.png"],
      variables: {
        width: 412,
        height: 915,
        scale: 2,
        stops: JSON.stringify([
          { x: 16, y: 200, width: 380, height: 300 },
          { x: 16, y: 520, width: 380, height: 120 },
        ]),
      },
    })
    expect(snipIdsOf(drawn.value)).toEqual([])
    // What isn't a snip is drawn as written.
    expect(drawn.value.shots[0]).toEqual(cut.shots[0])
  })

  it("is refused when home didn't hand the snip, or it names no such part, never a blank frame", async () => {
    const cut = await withSnips([
      { id: APK },
      { id: PHONE, at: ["QM-311:question"] },
    ])
    const drawn = resolveSnips(cut, given([phone()]))
    expect(drawn.ok).toBe(false)
    const problems = drawn.ok ? "" : drawn.problems.join("\n")
    expect(problems).toContain(
      `C1: it shows the snip ${APK}, which home did not hand`
    )
    expect(problems).toContain(`the snip ${PHONE} names no QM-311:question`)
  })

  it("is refused by the render until home hands it", async () => {
    const cut = await withSnips([{ id: APK }])
    const series = await readSeries(
      join(import.meta.dirname, "../sample/series/cheat-sheet"),
      cut.series.version
    )
    if (!series.ok) throw new Error(series.problems.join("; "))
    const resolved = resolve(cut, series.value)
    expect(resolved.ok ? "" : resolved.problems.join("\n")).toContain(
      `it shows the snip ${APK}, which home has not handed yet`
    )
  })

  it("names a snip only by its id", () => {
    const parsed = parseCutList({
      schema: "some-ui.cut-list/2",
      title: "t",
      series: { id: "cheat-sheet", version: 1 },
      look: "calm",
      shots: [
        {
          id: "a",
          picture: { kind: "snip", id: "the front page" },
          durationMs: 1000,
        },
      ],
    })
    expect(parsed.ok).toBe(false)
  })
})
