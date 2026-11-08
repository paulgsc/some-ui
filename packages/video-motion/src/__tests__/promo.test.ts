import { readFileSync } from "node:fs"
import { parseCutList, parseSeries, SOUNDS } from "@some-ui/video-render"
import { CUES } from "@some-ui/video-render/cues"
import {
  promoCutList,
  releaseProblems,
  ReleaseSchema,
} from "@video-motion/promo"
import type { Release } from "@video-motion/promo"
import type { WalkFile } from "@video-motion/walk/run"
import { describe, expect, it } from "vitest"

const release = (over: Partial<Release["fill"]> = {}): unknown => ({
  schema: "some-ui.promo/1",
  app: "suspender-ledger",
  version: "0.3.1",
  platform: "Firefox",
  stage: "Approved on AMO",
  fill: {
    title: "Suspender|Ledger",
    captions: ["One.", "Two."],
    cta: "Free for|Firefox",
    badges: ["No sign-in", "Source is public"],
    ...over,
  },
})

const walk: WalkFile = {
  schema: "some-ui.walk/1",
  app: "suspender-ledger",
  version: "0.3.1",
  viewport: { width: 320, height: 600, scale: 2 },
  snips: [
    { file: "snips/01.png", label: "Open", atMs: 0 },
    { file: "snips/02.png", label: "Tap", atMs: 2400 },
  ],
  taps: [{ label: "Tap", atMs: 2000, x: 10, y: 20 }],
  lengthMs: 4800,
}

describe("the release promo (HYPER3)", () => {
  it("refuses words that would not fit their place in the frame", () => {
    const read = ReleaseSchema.safeParse(
      release({
        title: "Suspender Ledger",
        captions: ["One|two|three"],
        cta: "Get it on Firefox Add-ons",
      })
    )
    expect(
      read.success ? [] : read.error.issues.map((i) => i.path.join("."))
    ).toEqual(["fill.title", "fill.captions.0", "fill.cta"])
  })

  it("is drawn only over a walk of the same app and release, a caption a screen", () => {
    const ok = ReleaseSchema.parse(release())
    expect(releaseProblems(ok, walk)).toEqual([])
    expect(
      releaseProblems(ReleaseSchema.parse(release({ captions: ["One."] })), {
        ...walk,
        version: "0.3.0",
      })
    ).toEqual([
      "the walk is of suspender-ledger 0.3.0, the release is 0.3.1",
      "the fill has 1 captions for the walk's 2 screens",
    ])
  })

  it("is a cut list of three composition scenes the renderer takes", () => {
    const ok = ReleaseSchema.parse(release())
    const cut = parseCutList(promoCutList(ok, walk))
    expect(
      cut.ok ? cut.value.shots.map((s) => [s.id, s.durationMs]) : cut.problems
    ).toEqual([
      ["hook", 3200],
      ["feature", 6200],
      ["close", 4000],
    ])
  })

  it("sounds on what each scene moves: the hook and feature leaving, the frame, each tap, the close", () => {
    const cut = promoCutList(ReleaseSchema.parse(release()), walk)
    expect(cut.series).toEqual({ id: "vertical", version: 2 })
    expect(cut.shots.map((s) => [s.id, s.overrides.cues])).toEqual([
      ["hook", [{ sound: "whoosh", atMs: 2650 }]],
      [
        "feature",
        [
          { sound: "pop", atMs: 50 },
          { sound: "click", atMs: 2800 },
          { sound: "whoosh", atMs: 5700 },
        ],
      ],
      ["close", [{ sound: "ding", atMs: 300 }]],
    ])
  })

  it("pins the series' sound kit to the cues the renderer makes (HYPER4)", () => {
    const read = parseSeries(
      JSON.parse(
        readFileSync(
          new URL("../../series/vertical/v2.json", import.meta.url),
          "utf8"
        )
      )
    )
    expect(read.ok && read.value.sounds).toEqual(
      Object.fromEntries(
        SOUNDS.map((sound) => [
          sound,
          {
            file: `brand/sounds/${CUES[sound].file}`,
            sha256: CUES[sound].sha256,
          },
        ])
      )
    )
  })
})
