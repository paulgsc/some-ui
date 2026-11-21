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
  isSnipId,
  parseSnipsGiven,
  pngSize,
  resolveScreens,
  SNIPS_GIVEN_SCHEMA,
  snipScreen,
  snipsOf,
} from "@video-render/snip"
import type { Handed, SnipRecord, SnipsGiven } from "@video-render/snip"
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
    const drawn = resolveScreens(cut, given([apk(), phone()]), { foot: 0.25 })
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
      },
    })
    expect(snipsOf(drawn.value)).toEqual([])
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
            of: { from: "snips", id: "the front page" },
          },
          durationMs: 1000,
        },
      ],
    })
    expect(parsed.ok).toBe(false)
  })
})

describe("the phone-card sample: a cards essay on a snip of the phone (#3311, C818)", () => {
  const KEY = "phone-card-2026-11-21"
  const SNIPS = join(VIDEOS, "phone-card", "snips")
  const series = (version: number): ReturnType<typeof readSeries> =>
    readSeries(
      join(import.meta.dirname, "../sample/series/cheat-sheet"),
      version
    )

  const handed = async (): Promise<SnipsGiven> => {
    const parsed = parseSnipsGiven(
      JSON.parse(await readFile(join(SNIPS, "snips.json"), "utf8"))
    )
    if (!parsed.ok) throw new Error(parsed.problems.join("; "))
    return parsed.value
  }

  it("is a cards essay cards-check passes, whose snips are the pictures they name", async () => {
    const cut = await showcase("phone-card")
    expect(parseCardsEssay(KEY, cut).ok).toBe(true)
    const v3 = await series(3)
    const files = new Map<string, unknown>([
      ["index.json", { schema: CARDS_INDEX_SCHEMA, essays: [{ key: KEY }] }],
      [`${KEY}.json`, cut],
    ])
    expect(
      cardsFolderProblems(files, (id, version) =>
        id === "cheat-sheet" && version === 3 && v3.ok ? v3.value : null
      )
    ).toEqual([])
    for (const snip of (await handed()).bundles.flatMap((b) => b.snips)) {
      const bytes = await readFile(join(SNIPS, snip.image.name))
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        snip.image.sha256
      )
      expect(bytes.length).toBe(snip.image.bytes)
      expect(pngSize(new Uint8Array(bytes))).toEqual({
        width: snip.width,
        height: snip.height,
      })
    }
  })

  it("boxes each part of its snip apart from the others, inside the picture", async () => {
    for (const snip of (await handed()).bundles.flatMap((b) => b.snips)) {
      const width = snip.width / snip.scale
      const height = snip.height / snip.scale
      for (const { ref, box } of snip.regions) {
        expect(box.x + box.width, ref).toBeLessThanOrEqual(width)
        expect(box.y + box.height, ref).toBeLessThanOrEqual(height)
      }
      // A part names one thing: none overlaps another, so a zoom to one
      // never rings its neighbour too.
      snip.regions.forEach((a, i) =>
        snip.regions.slice(i + 1).forEach((b) => {
          const apart =
            a.box.x + a.box.width <= b.box.x ||
            b.box.x + b.box.width <= a.box.x ||
            a.box.y + a.box.height <= b.box.y ||
            b.box.y + b.box.height <= a.box.y
          expect(apart, `${a.ref} and ${b.ref}`).toBe(true)
        })
      )
    }
  })

  it("draws each screen scene, zoomed or whole, from the handed snip in the look it is given", async () => {
    const look = { foot: 0.3, theme: "dark", ground: "#111821" }
    const drawn = resolveScreens(
      await showcase("phone-card"),
      { snips: await handed(), clips: null },
      look
    )
    if (!drawn.ok) throw new Error(drawn.problems.join("; "))
    expect(drawn.value.shots.map((shot) => shot.picture.kind)).toEqual([
      "card",
      "composition",
      "composition",
      "composition",
      "card",
    ])
    // C3 shows the card whole: the same composition with no stops.
    const whole = drawn.value.shots[3]?.picture
    expect(
      whole?.kind === "composition" ? whole.variables["stops"] : null
    ).toBe("[]")
    for (const shot of drawn.value.shots)
      if (shot.picture.kind === "composition") {
        expect(shot.picture.variables).toMatchObject(look)
        // The look never moves the picture out of the handed folder.
        expect(shot.picture.files).toEqual([
          "snips/web/phone/rust-rounds-sample-7da9fd68697e.png",
        ])
      }
  })
})
