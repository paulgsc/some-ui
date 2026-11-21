import { readFileSync } from "node:fs"
import { parseCutList } from "@some-ui/video-render"
import type { WalkFile } from "@video-motion/walk/run"
import {
  walkSlice,
  walkthroughCutList,
  walkthroughProblems,
  WalkthroughSchema,
} from "@video-motion/walkthrough"
import { describe, expect, it } from "vitest"

/** Jobs' walkthrough words, as the first render reads them (WALK4). */
const jobs = WalkthroughSchema.parse(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../../apps/www/tests/walk/jobs-walkthrough.json",
        import.meta.url
      ),
      "utf8"
    )
  )
)

/** A walk of `n` screens 2 s apart, each but the first reached by a tap 0.4 s before it. */
const walkOf = (n: number): WalkFile => ({
  schema: "some-ui.walk/1",
  app: "jobs",
  version: "0.0.11+snips.abc",
  viewport: { width: 411.43, height: 731.43, scale: 2.625 },
  snips: Array.from({ length: n }, (_, i) => ({
    file: `snips/${String(i + 1).padStart(2, "0")}.png`,
    label: `Step ${String(i + 1)}`,
    atMs: i * 2000,
  })),
  taps: Array.from({ length: n - 1 }, (_, i) => ({
    label: `Step ${String(i + 2)}`,
    atMs: (i + 1) * 2000 - 400,
    x: 100,
    y: 200,
  })),
  lengthMs: n * 2000,
})

describe("the walkthrough (WALK4)", () => {
  it("fits Jobs' walk: a caption a screen, the four stops in order", () => {
    expect(walkthroughProblems(jobs, walkOf(14))).toEqual([])
    expect(jobs.fill.chapters.map((c) => c.title)).toEqual([
      "This morning’s|picks",
      "Applying",
      "The interview|week",
      "The record",
    ])
  })

  it("refuses words that don't fit the walk", () => {
    const words = {
      ...jobs,
      app: "practice",
      fill: {
        ...jobs.fill,
        chapters: [
          { title: "One", from: 1 },
          { title: "Two", from: 1 },
          { title: "Three", from: 20 },
        ],
      },
    }
    expect(walkthroughProblems(words, walkOf(3))).toEqual([
      "the walk is of jobs, the words of practice",
      "the fill has 14 captions for the walk's 3 screens",
      "the first chapter starts at screen 0",
      "chapter 2 starts after the one before",
      "chapter 3 starts past the walk's last screen",
    ])
  })

  it("cuts a stop's screens and taps onto its own timeline", () => {
    const slice = walkSlice(walkOf(5), 2, 4)
    expect(slice.snips.map((s) => [s.file, s.atMs])).toEqual([
      ["snips/03.png", 0],
      ["snips/04.png", 2000],
    ])
    // A tap stays with the screen it lands on: the one into screen 3 is the
    // last stop's, and this stop's last tap leads into the next one.
    expect(slice.taps.map((t) => t.atMs)).toEqual([1600, 3600])
    expect(slice.lengthMs).toBe(4000)
    expect(walkSlice(walkOf(5), 4, 5).lengthMs).toBe(2000)
  })

  it("is the promo's scenes with a card before each stop", () => {
    const cut = parseCutList(walkthroughCutList(jobs, walkOf(14)))
    expect(cut.ok).toBe(true)
    if (!cut.ok) return
    expect(cut.value.shots.map((s) => s.id)).toEqual([
      "hook",
      "chapter-1",
      "stop-1",
      "chapter-2",
      "stop-2",
      "chapter-3",
      "stop-3",
      "chapter-4",
      "stop-4",
      "close",
    ])
    const refs = cut.value.shots.map((s) =>
      s.picture.kind === "composition" ? s.picture.ref : null
    )
    expect(new Set(refs)).toEqual(
      new Set(["promo-hook", "walk-chapter", "promo-feature", "promo-close"])
    )
    // Every screen is placed once, in order, across the stops.
    const files = cut.value.shots.flatMap((s) =>
      s.picture.kind === "composition" ? s.picture.files : []
    )
    expect(files).toEqual(walkOf(14).snips.map((s) => s.file))
    expect(cut.value.title).toBe("jobs walkthrough v0.0.11")
  })
})
