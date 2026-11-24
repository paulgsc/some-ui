/**
 * A walk as a screen a cards essay plays (#3476, `./walk`): the bundle's and
 * home's records read, and a walk scene drawn by the screen-zoom
 * composition with each step's picture and tap, from what home handed.
 */
import { parseCardsEssay } from "@video-render/cards-essay"
import type { CutList } from "@video-render/cut-list"
import { resolveScreens, walksOf } from "@video-render/snip"
import type { WalkFile, WalkRecord } from "@video-render/walk"
import {
  parseWalks,
  parseWalksGiven,
  WALKS_GIVEN_SCHEMA,
  WALKS_SCHEMA,
  walkSlice,
} from "@video-render/walk"
import { SCREEN_ZOOM } from "@video-render/zoom"
import { describe, expect, it } from "vitest"

import { showcase } from "./showcase"

const RUN = "45321427650"
const COMMIT = "c".repeat(40)
const SHA = "a".repeat(64)

const WALK: WalkFile = {
  schema: "some-ui.walk/1",
  app: "rust-rounds",
  version: "0.1.77",
  viewport: { width: 412, height: 732, scale: 2.625 },
  snips: [
    { file: "snips/01.png", label: "The week", atMs: 0 },
    { file: "snips/02.png", label: "A ticket", atMs: 3000 },
    { file: "snips/03.png", label: "The academy", atMs: 6200 },
  ],
  taps: [
    { label: "A ticket", atMs: 2600, x: 200, y: 400 },
    { label: "The academy", atMs: 5800, x: 206, y: 640 },
  ],
  lengthMs: 8800,
}

const record = (app = "rust-rounds", walk: WalkFile = WALK): WalkRecord => ({
  app,
  walk,
  pictures: walk.snips.map((s) => ({
    name: `${app}/${s.file}`,
    bytes: 1000,
    sha256: SHA,
  })),
})

const given = (walks = [record()]): unknown => ({
  schema: WALKS_GIVEN_SCHEMA,
  runs: [{ run: RUN, commit: COMMIT, walks }],
})

/** The Rust Scratchpad essay, its second scene playing `of`. */
async function playing(of: object): Promise<CutList> {
  const cut = await showcase("rust-scratchpad")
  const raw = {
    ...cut,
    shots: cut.shots.map((shot, i) =>
      i === 1 ? { ...shot, picture: { kind: "screen", of } } : shot
    ),
  }
  const parsed = parseCardsEssay("rust-scratchpad-2026-11-14", raw)
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

describe("a run's walks (#3476)", () => {
  it("reads a bundle whose pictures are each walk's steps, once", () => {
    const bundle = {
      schema: WALKS_SCHEMA,
      commit: COMMIT,
      run: RUN,
      walks: [record()],
    }
    expect(parseWalks(bundle).ok).toBe(true)
    const missing = record()
    expect(
      parseWalks({
        ...bundle,
        walks: [{ ...missing, pictures: missing.pictures.slice(1) }],
      }).ok
    ).toBe(false)
    expect(parseWalks({ ...bundle, walks: [record(), record()] }).ok).toBe(
      false
    )
    expect(parseWalks({ ...bundle, walks: [record("jobs")] }).ok).toBe(false)
  })

  it("reads what home hands, a run once", () => {
    expect(parseWalksGiven(given()).ok).toBe(true)
    expect(
      parseWalksGiven({
        schema: WALKS_GIVEN_SCHEMA,
        runs: [
          { run: RUN, commit: COMMIT, walks: [] },
          { run: RUN, commit: COMMIT, walks: [] },
        ],
      }).ok
    ).toBe(false)
  })

  it("slices a walk's steps onto their own timeline, each tap with the screen it lands on", () => {
    expect(walkSlice(WALK, 1, 3)).toEqual({
      ...WALK,
      snips: [
        { file: "snips/02.png", label: "A ticket", atMs: 0 },
        { file: "snips/03.png", label: "The academy", atMs: 3200 },
      ],
      taps: [{ label: "The academy", atMs: 2800, x: 206, y: 640 }],
      lengthMs: 5800,
    })
  })
})

describe("a walk scene in a cards essay (#3476)", () => {
  it("names each walk once, as home fetches them", async () => {
    const cut = await playing({ from: "walks", run: RUN, app: "rust-rounds" })
    expect(walksOf(cut)).toEqual([{ run: RUN, app: "rust-rounds" }])
  })

  it("plays the steps it names in screen-zoom, each picture and tap", async () => {
    const cut = await playing({
      from: "walks",
      run: RUN,
      app: "rust-rounds",
      steps: [2, 3],
    })
    const parsed = given()
    const handed = parseWalksGiven(parsed)
    if (!handed.ok) throw new Error(handed.problems.join("; "))
    const drawn = resolveScreens(cut, {
      snips: null,
      clips: null,
      walks: handed.value,
    })
    if (!drawn.ok) throw new Error(drawn.problems.join("; "))
    const picture = drawn.value.shots[1]?.picture
    if (picture?.kind !== "composition") throw new Error("not drawn")
    expect(picture.ref).toBe(SCREEN_ZOOM)
    expect(picture.files).toEqual([
      `walks/${RUN}/rust-rounds/snips/02.png`,
      `walks/${RUN}/rust-rounds/snips/03.png`,
    ])
    expect(picture.variables).toMatchObject({
      picture: `walks/${RUN}/rust-rounds/snips/02.png`,
      width: 412,
      height: 732,
      scale: 2.625,
      stops: "[]",
    })
    expect(JSON.parse(String(picture.variables["walk"]))).toEqual({
      frames: [
        { picture: `walks/${RUN}/rust-rounds/snips/02.png`, atMs: 0 },
        { picture: `walks/${RUN}/rust-rounds/snips/03.png`, atMs: 3200 },
      ],
      taps: [{ atMs: 2800, x: 206, y: 640 }],
      lengthMs: 5800,
    })
  })

  it("refuses a walk home didn't hand, and steps the walk doesn't have", async () => {
    const other = await playing({ from: "walks", run: "1", app: "rust-rounds" })
    const handed = parseWalksGiven(given())
    if (!handed.ok) throw new Error("unread")
    const none = resolveScreens(other, {
      snips: null,
      clips: null,
      walks: handed.value,
    })
    expect(none.ok ? [] : none.problems).toEqual([
      "C1: it plays the rust-rounds walk of run 1, which home did not hand",
    ])
    const past = await playing({
      from: "walks",
      run: RUN,
      app: "rust-rounds",
      steps: [2, 9],
    })
    const short = resolveScreens(past, {
      snips: null,
      clips: null,
      walks: handed.value,
    })
    expect(short.ok ? [] : short.problems).toEqual([
      "C1: it plays steps 2 to 9 of the rust-rounds walk, which has 3",
    ])
  })

  it("refuses steps out of order in the cut list itself", async () => {
    await expect(
      playing({ from: "walks", run: RUN, app: "rust-rounds", steps: [3, 2] })
    ).rejects.toThrow(/its first step comes before its last/)
  })
})
