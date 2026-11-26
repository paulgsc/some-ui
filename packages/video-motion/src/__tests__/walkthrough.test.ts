import { readFileSync } from "node:fs"
import { MODULE_OPENS_SCHEMA, PIPELINES } from "@some-ui/engagement"
import {
  FRICTION_SCHEMA,
  frictionOf,
  parseCutList,
} from "@some-ui/video-render"
import type { StillTake } from "@some-ui/video-render"
import type { WalkFile } from "@video-motion/walk/run"
import {
  BREATH_MS,
  retimed,
  voicedWalkthrough,
  walkthroughCutList,
  walkthroughLines,
  walkthroughProblems,
  WalkthroughSchema,
} from "@video-motion/walkthrough"
import {
  measureNotes,
  measureSaid,
  silenceNotes,
  silenceSaid,
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

/** Home's weekly read, as the report's sample holds it, on the registry (WALK5). */
const sampleHome: unknown = JSON.parse(
  readFileSync(
    new URL(
      "../../../video-render/src/templates/engagement-report/sample-weeks.json",
      import.meta.url
    ),
    "utf8"
  )
)
const read = frictionOf(sampleHome, PIPELINES)
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
          { title: "One", from: 1, narration: ["One."] },
          { title: "Two", from: 1, narration: ["Two."] },
          { title: "Three", from: 20, narration: ["Three."] },
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

  it("says each stop's narration, never its captions, read as the cards essays are", () => {
    const cut = walkthroughCutList(jobs, walkOf(15))
    expect(cut.voice).toBe("read")
    const stop = cut.shots.find((s) => s.id === "stop-2")
    expect(stop?.spoken).toEqual({
      role: "walk",
      lines: jobs.fill.chapters[1]?.narration,
    })
    const said = walkthroughLines(cut).map((l) => l.said)
    for (const caption of jobs.fill.captions)
      expect(said).not.toContain(caption.split("|").join(" "))
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

  it("lays a stop's lines back to back, its screens stretched by one factor to hold them", () => {
    const walk = walkOf(15)
    const lines = walkthroughLines(walkthroughCutList(jobs, walk, friction))
    const takes = new Map<string, StillTake>(
      lines.map((l) => [
        l.file,
        { ms: 2500, words: [{ text: "Here", startMs: 0, endMs: 400 }] },
      ])
    )
    const { cut, laid } = voicedWalkthrough(jobs, walk, friction, takes)
    const parsed = parseCutList(cut)
    expect(parsed.ok ? [] : parsed.problems).toEqual([])
    const stop = cut.shots.find((s) => s.id === "stop-1")
    const n = stop?.spoken?.role === "walk" ? stop.spoken.lines.length : 0
    const atMs = Array.from({ length: n }, (_, k) => k * (2500 + BREATH_MS))
    expect(laid.find((l) => l.file === "stop-1.wav")?.lines).toEqual(
      atMs.map((at, k) => ({ file: `stop-1-0${String(k + 1)}.wav`, atMs: at }))
    )
    expect(stop?.take?.words?.map((w) => w.startMs)).toEqual(atMs)
    expect(stop?.speaker).toBe("kokoro")
    // Three screens of 2 s, stretched alike to hold every line and a breath.
    const said = n * 2500 + n * BREATH_MS
    const factor = said / 6000
    expect(stop?.overrides.cues?.filter((c) => c.sound === "click")).toEqual([
      { sound: "click", atMs: 800 + Math.ceil(2000 * factor) - 400 },
      { sound: "click", atMs: 800 + 2 * Math.ceil(2000 * factor) - 400 },
      { sound: "click", atMs: 800 + 3 * Math.ceil(2000 * factor) - 400 },
    ])
    // Only the stops are voiced: the cards stay silent (C945).
    expect(laid.map((l) => l.file)).toEqual([
      "stop-1.wav",
      "stop-2.wav",
      "stop-3.wav",
      "stop-4.wav",
    ])
    for (const shot of cut.shots)
      if (shot.id.startsWith("chapter") || shot.id === "silence")
        expect([shot.spoken, shot.take]).toEqual([undefined, undefined])
  })

  it("says what real use shows of each stop after its narration, and names the modules nobody opens", () => {
    const cut = walkthroughCutList(jobs, walkOf(15), friction)
    const ids = cut.shots.map((s) => s.id)
    expect(ids.slice(-2)).toEqual(["silence", "close"])
    const extra = (i: number): ReadonlyArray<string> => {
      const spoken = cut.shots.find((s) => s.id === `stop-${String(i)}`)?.spoken
      const lines = spoken?.role === "walk" ? spoken.lines : []
      return lines.slice(jobs.fill.chapters[i - 1]?.narration.length)
    }
    expect(extra(1)).toEqual([
      "In the last four weeks, I spent time on this step 20 times, moved on from it 9 times and left it from this step 5 times; a stretch here runs about 41 seconds.",
    ])
    expect(extra(2)).toEqual([
      "In the last four weeks, I spent time on this step 7 times; a stretch here runs about 2 minutes.",
      "I rated how hard applying felt fewer than 5 times in these four weeks.",
    ])
    expect(extra(4)).toEqual([
      WALKTHROUGH_WORDS.nothingKept.said,
      "Some of what I built, I haven't opened lately: aph, for 6 weeks. How I use 12 other modules isn't measured yet.",
    ])
    const card = (id: string): unknown => {
      const picture = cut.shots.find((s) => s.id === id)?.picture
      return picture?.kind === "composition" ? picture.variables.notes : null
    }
    expect(card("chapter-1")).toBe(
      "Last 4 weeks|Here 20 times|Moved on 9 times|Left from here 5 times|About 41 s a stretch"
    )
    // Without home's aggregate, nothing is measured and there's no silence card.
    const bare = walkthroughCutList(jobs, walkOf(15))
    expect(bare.shots.map((s) => s.id)).not.toContain("silence")
    expect(bare.shots.find((s) => s.id === "stop-1")?.spoken).toEqual({
      role: "walk",
      lines: jobs.fill.chapters[0]?.narration,
    })
  })

  it("says a step was left at its last step where home counted it", () => {
    const counts = {
      pipeline: "jobs",
      affordance: "todays-pick",
      place: "ending",
      stretchesLeft: 11 as const,
      movedOn: "no-data" as const,
      finished: 5 as const,
      leftPartWay: "no-data" as const,
      medianMs: null,
    }
    expect(measureSaid([{ kind: "place", counts }])).toEqual([
      "In the last four weeks, I spent time on this step 11 times and left it at its last step 5 times.",
    ])
  })

  it("says a step home couldn't count whole as not counted, never as nothing kept or as used a lot", () => {
    const counts = {
      pipeline: "jobs",
      affordance: "todays-pick",
      place: "read",
      stretchesLeft: "no-data" as const,
      movedOn: "no-data" as const,
      finished: "no-data" as const,
      leftPartWay: "no-data" as const,
      medianMs: null,
    }
    expect(measureSaid([{ kind: "place", counts }], true)).toEqual([
      WALKTHROUGH_WORDS.tooMuch.said,
    ])
    // A partial read is a fact about the whole read: it says nothing of how
    // much this step was used.
    expect(WALKTHROUGH_WORDS.tooMuch.said).not.toMatch(
      /more than|a lot|often$/u
    )
    expect(measureSaid([{ kind: "place", counts }])).toEqual([
      WALKTHROUGH_WORDS.nothingKept.said,
    ])
  })

  it("never calls a module silent that home began measuring inside the window and holds no open of", () => {
    const late: typeof friction = {
      ...friction,
      modules: friction.modules.map((m) =>
        m.pipeline === "aph"
          ? {
              ...m,
              opened: { kind: "measured", days: 0, of: 10, weeksQuiet: null },
            }
          : m
      ),
    }
    const { cut } = voicedWalkthrough(jobs, walkOf(15), late, new Map())
    const spoken = cut.shots.find((s) => s.id === "stop-4")?.spoken
    const said = (spoken?.role === "walk" ? spoken.lines : []).join(" ")
    expect(said).not.toContain("haven't opened")
    expect(said).toContain("How I use 13 other modules isn't measured yet.")
  })

  it("says how long each silent module has gone unopened, never first, then the longest quiet (C937)", () => {
    const quiet: typeof friction = {
      ...friction,
      modules: friction.modules.map((m) =>
        m.pipeline === "jobs"
          ? {
              ...m,
              opened: { kind: "measured", days: 0, of: 28, weeksQuiet: null },
            }
          : m
      ),
    }
    const { cut } = voicedWalkthrough(jobs, walkOf(15), quiet, new Map())
    const spoken = cut.shots.find((s) => s.id === "stop-4")?.spoken
    const said = (spoken?.role === "walk" ? spoken.lines : []).join(" ")
    expect(said).toContain(
      "I haven't opened lately: Jobs, never; aph, for 6 weeks."
    )
  })

  it("keeps an aggregate report:vestiges reads", () => {
    expect(MODULE_OPENS_SCHEMA).toBe(FRICTION_SCHEMA)
  })

  it("refuses a stop's place home's aggregate doesn't hold", () => {
    const words = {
      ...jobs,
      fill: {
        ...jobs.fill,
        chapters: jobs.fill.chapters.map((c, i) =>
          i === 0
            ? {
                ...c,
                measures: [
                  {
                    kind: "place" as const,
                    pipeline: "jobs",
                    affordance: "todays-pick",
                    place: "nowhere",
                  },
                ],
              }
            : c
        ),
      },
    }
    expect(walkthroughProblems(words, walkOf(15), friction)).toEqual([
      "chapter 1 names jobs/todays-pick/nowhere, which home's aggregate doesn't hold",
    ])
  })

  it("never says every module was opened when none is measured, and keeps long names on the card", () => {
    const none = { silent: [], measured: 0, notMeasured: 13 }
    expect(silenceNotes(none)).toBe(
      WALKTHROUGH_WORDS.silence.nothingMeasured.drawn
    )
    expect(silenceSaid(none)).toBe(
      WALKTHROUGH_WORDS.silence.nothingMeasured.said
    )
    const long = {
      silent: [
        { pipeline: "x", name: "Playoff delta by the week", weeksQuiet: 5 },
      ],
      measured: 1,
      notMeasured: 0,
    }
    expect(silenceNotes(long)).toBe("Playoff delta b…: 5 weeks")
    expect(silenceSaid(long)).toContain(
      "Playoff delta by the week, for 5 weeks"
    )
  })

  it("says it in the viewer's terms, never the machinery's", () => {
    const all = [
      measureNotes([{ kind: "not-measured" }]),
      ...measureSaid([{ kind: "not-measured" }]),
      ...walkthroughLines(walkthroughCutList(jobs, walkOf(15), friction)).map(
        (l) => l.said
      ),
    ].join(" ")
    expect(all).not.toMatch(
      /\b(request|status|sync|grant|event|aggregate|pipeline|null|undefined|NaN|no-data|fewer-than-5)\b/i
    )
  })
})
