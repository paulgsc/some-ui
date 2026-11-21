import { readFileSync } from "node:fs"
import { PIPELINES } from "@some-ui/engagement"
import { parseCutList, parseFriction } from "@some-ui/video-render"
import type { StillTake } from "@some-ui/video-render"
import type { WalkFile } from "@video-motion/walk/run"
import {
  BREATH_MS,
  retimed,
  voicedWalkthrough,
  walkSlice,
  walkthroughCutList,
  walkthroughLines,
  walkthroughProblems,
  WalkthroughSchema,
} from "@video-motion/walkthrough"
import {
  frictionNotes,
  frictionSaid,
  WALKTHROUGH_WORDS,
} from "@video-motion/walkthrough-words"
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

/** Home's friction aggregate, as the contract's sample holds it (WALK5). */
const read = parseFriction(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../video-render/src/sample/friction.json",
        import.meta.url
      ),
      "utf8"
    )
  )
)
if (!read.ok) throw new Error(read.problems.join("\n"))
const friction = read.value

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
    expect(walkthroughProblems(jobs, walkOf(15))).toEqual([])
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
      "the fill has 15 captions for the walk's 3 screens",
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
    const cut = parseCutList(walkthroughCutList(jobs, walkOf(15)))
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
    expect(files).toEqual(walkOf(15).snips.map((s) => s.file))
    expect(cut.value.title).toBe("jobs walkthrough v0.0.11")
  })

  it("says each stop's captions, a line a screen, read as the cards essays are", () => {
    const cut = walkthroughCutList(jobs, walkOf(15))
    expect(cut.voice).toBe("read")
    const stop = cut.shots.find((s) => s.id === "stop-2")
    expect(stop?.spoken).toEqual({
      role: "walk",
      lines: [
        "A résumé built for this one",
        "The paste kit stays on the phone",
      ],
    })
    // The take starts as the walk's first screen does.
    expect(stop?.voiceInMs).toBe(800)
    expect(
      walkthroughLines(cut)
        .map((l) => l.file)
        .slice(0, 3)
    ).toEqual(["stop-1-01", "stop-1-02", "stop-1-03"])
  })

  it("holds each screen for at least its line, its taps at the same offsets", () => {
    const walk = walkOf(3)
    const longer = retimed(walk, [3000, 1000, 2500])
    expect(longer.snips.map((s) => s.atMs)).toEqual([0, 3000, 5000])
    expect(longer.taps.map((t) => t.atMs)).toEqual([2600, 4600])
    expect(longer.lengthMs).toBe(7500)
    expect(retimed(walk, [0, 0, 0])).toEqual(walk)
  })

  it("lays each stop's lines at its screens, inside the scene, with the clicks moved", () => {
    const words = jobs
    const walk = walkOf(15)
    const lines = walkthroughLines(walkthroughCutList(words, walk, friction))
    const takes = new Map<string, StillTake>(
      lines.map((l) => [
        l.file,
        { ms: 2500, words: [{ text: "Here", startMs: 0, endMs: 400 }] },
      ])
    )
    const { cut, laid } = voicedWalkthrough(words, walk, friction, takes)
    const parsed = parseCutList(cut)
    expect(parsed.ok ? [] : parsed.problems).toEqual([])
    const stop = cut.shots.find((s) => s.id === "stop-1")
    const atMs = [0, 2500 + BREATH_MS, 2 * (2500 + BREATH_MS)]
    expect(laid.find((l) => l.file === "stop-1.wav")?.lines).toEqual(
      atMs.map((at, k) => ({ file: `stop-1-0${String(k + 1)}.wav`, atMs: at }))
    )
    expect(stop?.take?.words?.map((w) => w.startMs)).toEqual(atMs)
    expect(stop?.speaker).toBe("kokoro")
    // The tap into screen 2 still lands 0.4 s before it.
    expect(stop?.overrides.cues?.filter((c) => c.sound === "click")[0]).toEqual(
      { sound: "click", atMs: 800 + atMs[1]! - 400 }
    )
    // Every voiced shot is laid; a card holds for its line and a beat.
    expect(laid.map((l) => l.file)).toContain("chapter-1.wav")
    expect(laid.map((l) => l.file)).toContain("silence.wav")
  })

  it("says what real use shows of each stop, and names the modules nobody opens", () => {
    const cut = walkthroughCutList(jobs, walkOf(15), friction)
    const ids = cut.shots.map((s) => s.id)
    expect(ids.slice(-2)).toEqual(["silence", "close"])
    const said = (id: string): string => {
      const spoken = cut.shots.find((s) => s.id === id)?.spoken
      return spoken?.role === "walk" ? spoken.lines.join(" ") : ""
    }
    expect(said("chapter-1")).toBe(
      "In the last four weeks, it was finished 14 times, left part-way 6 times, about 41 seconds a visit."
    )
    expect(said("chapter-2")).toBe(
      "In the last four weeks, it was finished fewer than 5 times, left part-way 7 times."
    )
    expect(said("chapter-4")).toBe(WALKTHROUGH_WORDS.nothingKept.said)
    expect(said("silence")).toBe(
      "Not opened in the last four weeks: aph, for 6 weeks. 11 more aren't measured, so they can't be called quiet."
    )
    // Without home's aggregate, the cards say nothing and there's no silence card.
    expect(
      walkthroughCutList(jobs, walkOf(15)).shots.map((s) => s.id)
    ).not.toContain("silence")
  })

  it("names only places the registry has, for Jobs' stops and the sample", () => {
    const has = (p: {
      pipeline: string
      affordance: string
      place: string
    }): boolean =>
      PIPELINES.find((x) => x.id === p.pipeline)
        ?.affordances.find((a) => a.id === p.affordance)
        ?.places?.some((c) => c.id === p.place) === true
    for (const c of jobs.fill.chapters)
      if (c.place) expect(has(c.place)).toBe(true)
    for (const p of friction.places) expect(has(p)).toBe(true)
    for (const m of friction.modules)
      expect(PIPELINES.some((x) => x.id === m.pipeline)).toBe(true)
  })

  it("says it in the viewer's terms, never the machinery's", () => {
    const all = [
      frictionNotes({ kind: "not-measured" }),
      frictionSaid({ kind: "not-measured" }),
      ...walkthroughLines(walkthroughCutList(jobs, walkOf(15), friction)).map(
        (l) => l.said
      ),
    ].join(" ")
    expect(all).not.toMatch(
      /\b(request|status|sync|grant|event|aggregate|pipeline|null|undefined|NaN|no-data|fewer-than-5)\b/i
    )
  })
})
