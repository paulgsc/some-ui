import { createHash } from "node:crypto"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  CARDS_INDEX_SCHEMA,
  cardsFolderProblems,
  parseCardsEssay,
} from "@video-render/cards-essay"
import type { CutList } from "@video-render/cut-list"
import { parseCutList } from "@video-render/cut-list"
import { nodePorts, readSeries } from "@video-render/node"
import { render } from "@video-render/render"
import {
  clipFramesOf,
  parseSnipsGiven,
  pngSize,
  resolveScreens,
  SNIP_ID,
  SNIPS_GIVEN_SCHEMA,
  snipScreen,
  snipsOf,
} from "@video-render/snip"
import type { Handed, SnipRecord } from "@video-render/snip"
import * as fixtures from "@video-render/testing"
import { SCREEN_ZOOM } from "@video-render/zoom"
import { describe, expect, it } from "vitest"

import { showcase, VIDEOS } from "./showcase"

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

/** The commit the test's snips were captured at, and another. */
const COMMIT = "c".repeat(40)
const LATER = "e".repeat(40)

const given = (
  snips: Array<SnipRecord>,
  clips: Array<string> | null = null,
  commit = COMMIT
): Handed => {
  const parsed = parseSnipsGiven({
    schema: SNIPS_GIVEN_SCHEMA,
    bundles: [{ commit, snips }],
  })
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return {
    snips: parsed.value,
    clips:
      clips && new Map(clips.map((f) => [f, { width: 824, height: 1830 }])),
  }
}

type Of =
  | { from: "snips"; id: string; commit: string; at?: Array<string> }
  | { from: "clips"; clip: string; side: "before" | "after"; file: string }

const snip = (id: string, at?: Array<string>, commit = COMMIT): Of => ({
  from: "snips",
  id,
  commit,
  ...(at ? { at } : {}),
})

/** The Rust Scratchpad essay, its second scene on showing the screens given. */
async function withScreens(pictures: ReadonlyArray<Of>): Promise<CutList> {
  const cut = await showcase("rust-scratchpad")
  const raw = {
    ...cut,
    shots: cut.shots.map((shot, i) => {
      const of = pictures[i - 1]
      return of === undefined
        ? shot
        : { ...shot, picture: { kind: "screen", of } }
    }),
  }
  const parsed = parseCardsEssay("rust-scratchpad-2026-11-14", raw)
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

describe("a snip's id (SNIPS1's grammar)", () => {
  it("refuses a short hash and an unknown surface", () => {
    expect(SNIP_ID.test("web:/:desktop:0.1.69:0123")).toBe(false)
    expect(SNIP_ID.test("tv:/:desktop:0.1.69:0123456789ab")).toBe(false)
  })

  it("is refused on a record whose picture it isn't", () => {
    const parsed = parseSnipsGiven({
      schema: SNIPS_GIVEN_SCHEMA,
      bundles: [
        {
          commit: COMMIT,
          snips: [
            { ...phone(), image: { ...phone().image, sha256: "e".repeat(64) } },
          ],
        },
      ],
    })
    expect(parsed.ok ? "" : parsed.problems.join("\n")).toContain(
      "is not the picture"
    )
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

describe("an essay's screens of the app (SNIPS4)", () => {
  it("is a cards essay's scene, and names its snips once each", async () => {
    const cut = await withScreens([snip(APK), snip(PHONE), snip(APK)])
    expect(snipsOf(cut)).toEqual([
      { commit: COMMIT, id: APK },
      { commit: COMMIT, id: PHONE },
    ])
  })

  it("is the whole phone held above the captions, or zoomed to the parts it names", async () => {
    const cut = await withScreens([
      snip(APK),
      snip(PHONE, ["QM-311:program", "QM-311:run"]),
    ])
    const drawn = resolveScreens(cut, given([apk(), phone()]), {
      foot: 0.25,
      theme: "dark",
      ground: "#111821",
    })
    if (!drawn.ok) throw new Error(drawn.problems.join("; "))
    // The owner (2026-11-21): not full-bleed, the caption below the screen.
    expect(drawn.value.shots[1]?.picture).toEqual({
      kind: "composition",
      ref: SCREEN_ZOOM,
      variables: {
        picture: "snips/apk/android/release-studio~takes-dddddddddddd.png",
        width: 1080,
        height: 1920,
        scale: 1,
        stops: "[]",
        foot: 0.25,
        theme: "dark",
        ground: "#111821",
      },
      files: ["snips/apk/android/release-studio~takes-dddddddddddd.png"],
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
        foot: 0.25,
        theme: "dark",
        ground: "#111821",
      },
    })
    expect(snipsOf(drawn.value)).toEqual([])
    // The render reads the drawn cut list again: a snip of a nested route
    // (`studio~takes`) is a file it takes.
    const rendered = parseCutList(drawn.value)
    expect(rendered.ok ? [] : rendered.problems).toEqual([])
    // What isn't a snip is drawn as written.
    expect(drawn.value.shots[0]).toEqual(cut.shots[0])
  })

  it("is refused when home didn't hand the snip, or it names no such part, never a blank frame", async () => {
    const cut = await withScreens([snip(APK), snip(PHONE, ["QM-311:question"])])
    const drawn = resolveScreens(cut, given([phone()]))
    expect(drawn.ok).toBe(false)
    const problems = drawn.ok ? "" : drawn.problems.join("\n")
    expect(problems).toContain(
      `C1: it shows the snip ${APK}, which home did not hand`
    )
    expect(problems).toContain(`the snip ${PHONE} names no QM-311:question`)
  })

  it("is refused when home handed the snip from another commit than the essay names (C868)", async () => {
    const cut = await withScreens([snip(APK, undefined, LATER)])
    const drawn = resolveScreens(cut, given([apk()]))
    expect(drawn.ok ? "" : drawn.problems.join("\n")).toContain(
      `C1: it shows the snip ${APK} of ${LATER}, and home handed it from ${COMMIT}`
    )
    const both = parseSnipsGiven({
      schema: SNIPS_GIVEN_SCHEMA,
      bundles: [
        { commit: COMMIT, snips: [apk()] },
        { commit: COMMIT, snips: [] },
      ],
    })
    expect(both.ok).toBe(false)
  })

  it("draws a screen unchanged between two commits as one picture", async () => {
    const cut = await withScreens([snip(APK), snip(APK, undefined, LATER)])
    const parsed = parseSnipsGiven({
      schema: SNIPS_GIVEN_SCHEMA,
      bundles: [
        { commit: COMMIT, snips: [apk()] },
        { commit: LATER, snips: [apk()] },
      ],
    })
    if (!parsed.ok) throw new Error(parsed.problems.join("; "))
    const drawn = resolveScreens(cut, { snips: parsed.value, clips: null })
    if (!drawn.ok) throw new Error(drawn.problems.join("; "))
    expect(drawn.value.shots[1]?.picture).toEqual(drawn.value.shots[2]?.picture)
  })

  it("shows a Clips Library frame home handed whole, and refuses one it didn't", async () => {
    const frame: Of = {
      from: "clips",
      clip: "studio-release-promo",
      side: "after",
      file: "02-release-promo.png",
    }
    const cut = await withScreens([frame, snip(APK)])
    expect(clipFramesOf(cut)).toEqual([
      "studio-release-promo/after/02-release-promo.png",
    ])
    const drawn = resolveScreens(
      cut,
      given([apk()], ["studio-release-promo/after/02-release-promo.png"])
    )
    if (!drawn.ok) throw new Error(drawn.problems.join("; "))
    expect(drawn.value.shots[1]?.picture).toMatchObject({
      kind: "composition",
      ref: SCREEN_ZOOM,
      variables: { width: 824, height: 1830, scale: 1, stops: "[]" },
      files: ["clips/studio-release-promo/after/02-release-promo.png"],
    })
    const refused = resolveScreens(cut, given([apk()]))
    expect(refused.ok ? "" : refused.problems.join("\n")).toContain(
      "C1: it shows the clip frame studio-release-promo/after/02-release-promo.png, which home did not hand"
    )
  })

  it("is refused by the render until home hands it, never drawn blank", async () => {
    const root = await mkdtemp(join(tmpdir(), "snip-"))
    const cut = fixtures.cutList([
      fixtures.shot("a", {
        picture: {
          kind: "screen",
          of: { from: "snips", id: APK, commit: COMMIT, at: [] },
        },
      }),
    ])
    const drawn = await render(cut, fixtures.series(), nodePorts(root), {
      workDir: "work",
      out: "out/video.mp4",
    })
    expect(drawn.ok ? "" : drawn.problems.join("\n")).toContain(
      "a: it shows a screen of the app home has not handed yet"
    )
  })

  it("passes the cards check, which hands it nothing: home hands it at render", async () => {
    const cut = await withScreens([snip(APK)])
    const series = await readSeries(
      join(import.meta.dirname, "../sample/series/cheat-sheet"),
      cut.series.version
    )
    if (!series.ok) throw new Error(series.problems.join("; "))
    const files = new Map<string, unknown>([
      [
        "index.json",
        {
          schema: CARDS_INDEX_SCHEMA,
          essays: [{ key: "rust-scratchpad-2026-11-14" }],
        },
      ],
      ["rust-scratchpad-2026-11-14.json", cut],
    ])
    expect(
      cardsFolderProblems(files, (id, version) =>
        id === series.value.id && version === series.value.version
          ? series.value
          : null
      )
    ).toEqual([])
  })

  it("is refused on a spoken card, which its stage draws", async () => {
    const cut = await showcase("spoken-intro")
    const at = cut.shots.findIndex((s) => s.spoken?.role === "spoken")
    expect(at).toBeGreaterThanOrEqual(0)
    const raw = {
      ...cut,
      shots: cut.shots.map((s, i) =>
        i === at ? { ...s, picture: { kind: "screen", of: snip(APK) } } : s
      ),
    }
    const parsed = parseCardsEssay("spoken-intro-2026-11-14", raw)
    expect(parsed.ok ? "" : parsed.problems.join("\n")).toContain(
      "a spoken card is drawn by its stage, so it shows no screen of the app"
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
          picture: {
            kind: "screen",
            of: { from: "snips", id: "the front page", commit: COMMIT },
          },
          durationMs: 1000,
        },
      ],
    })
    expect(parsed.ok ? "" : parsed.problems.join("\n")).toContain(
      "it isn't a snip's id"
    )
  })
})

describe("the phone-card sample: a cards essay on a snip of the phone (#3311, C818)", () => {
  it("is publishable, and every screen it shows is one its snips hold", async () => {
    const KEY = "phone-card-2026-11-21"
    const cut = await showcase("phone-card")
    const v3 = await readSeries(
      join(import.meta.dirname, "../sample/series/cheat-sheet"),
      3
    )
    const files = new Map<string, unknown>([
      ["index.json", { schema: CARDS_INDEX_SCHEMA, essays: [{ key: KEY }] }],
      [`${KEY}.json`, cut],
    ])
    expect(
      cardsFolderProblems(files, (id, version) =>
        id === "cheat-sheet" && version === 3 && v3.ok ? v3.value : null
      )
    ).toEqual([])
    const given = parseSnipsGiven(
      JSON.parse(
        await readFile(
          join(VIDEOS, "phone-card", "snips", "snips.json"),
          "utf8"
        )
      )
    )
    if (!given.ok) throw new Error(given.problems.join("; "))
    expect(resolveScreens(cut, { snips: given.value, clips: null }).ok).toBe(
      true
    )
    // record:cards checks these on home; nothing in CI runs it on the sample.
    for (const snip of given.value.bundles.flatMap((b) => b.snips)) {
      const bytes = await readFile(
        join(VIDEOS, "phone-card", "snips", snip.image.name)
      )
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        snip.image.sha256
      )
      expect(pngSize(bytes)).toEqual({ width: snip.width, height: snip.height })
      // Each part is one thing, so a zoom to it rings nothing else.
      for (const [i, { box: a }] of snip.regions.entries())
        for (const { box: b } of snip.regions.slice(i + 1))
          expect(
            a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y
          ).toBe(true)
    }
  })
})
