import {
  callChapterMarks,
  callParts,
  callScenes,
  CallWeekSchema,
  sampleCallWeek,
} from "@video-render/call"
import type { CallWeek } from "@video-render/call"
import {
  chapterLines,
  chaptersFound,
  chaptersOf,
  FEWEST_CHAPTERS,
  OPENING,
  stamp,
} from "@video-render/chapters"
import { readPinned } from "@video-render/node"
import { heldMs } from "@video-render/stills"
import { NOV_6_WEEK } from "@video-render/testing"
import type { ShotTime } from "@video-render/timing"
import { beforeAll, describe, expect, it } from "vitest"

const at = (id: string, startMs: number, durationMs: number): ShotTime => ({
  id,
  cut: null,
  startMs,
  durationMs,
})

describe("an episode's chapters (SFEED4)", () => {
  it("open at 0:00 and start at each marked scene, a slide joined to what follows", () => {
    const times = [
      at("intro", 0, 20_000),
      at("chapter-board", 20_000, 3_000),
      at("board", 23_000, 30_000),
      at("chapter-asks", 53_000, 3_000),
      at("asks-1", 56_000, 40_000),
      at("asks-2", 96_000, 40_000),
      at("close", 136_000, 8_000),
    ]
    const chapters = chaptersOf(times, [
      { scene: "chapter-board", title: "The board", slide: true },
      { scene: "chapter-asks", title: "Waiting on you", slide: true },
      { scene: "asks-1", title: "Which music?" },
      { scene: "asks-2", title: "Which mark?" },
    ])
    expect(chapterLines(chapters)).toBe(
      [
        `0:00 ${OPENING}`,
        "0:20 The board",
        "0:53 Which music?",
        "1:36 Which mark?",
        "",
      ].join("\n")
    )
  })

  it("are none when fewer than three would show, as YouTube shows none", () => {
    expect(
      chaptersOf(
        [at("intro", 0, 20_000), at("chapter-a", 20_000, 30_000)],
        [{ scene: "chapter-a", title: "A" }]
      )
    ).toEqual([])
  })

  it("never keep one shorter than ten seconds, the last included", () => {
    const chapters = chaptersOf(
      [
        at("a", 0, 15_000),
        at("b", 15_000, 15_000),
        at("c", 30_000, 15_000),
        at("d", 45_000, 5_000),
      ],
      ["b", "c", "d"].map((scene) => ({ scene, title: scene }))
    )
    expect(chapters.map((c) => c.title)).toEqual([OPENING, "b", "c"])
  })

  it("write their times as YouTube reads them", () => {
    expect([0, 61_000, 3_725_000].map(stamp)).toEqual([
      "0:00",
      "1:01",
      "1:02:05",
    ])
  })

  it("join a short one that isn't a slide to the chapter after it, and keep titles on one line", () => {
    const chapters = chaptersOf(
      [
        at("intro", 0, 20_000),
        at("asks-1", 20_000, 4_000),
        at("asks-2", 24_000, 30_000),
        at("asks-3", 54_000, 30_000),
      ],
      [
        { scene: "asks-1", title: "Which\nmusic?" },
        { scene: "asks-2", title: "Which <mark>?" },
        { scene: "asks-3", title: "Which palette?" },
      ]
    )
    expect(chapterLines(chapters)).toBe(
      `0:00 ${OPENING}\n0:20 Which music?\n0:54 Which palette?\n`
    )
  })

  it("for the call, are each chapter slide and each ask by its question", () => {
    const week = sampleCallWeek()
    if (!week.ok) throw new Error(week.problems.join("; "))
    const marks = callChapterMarks(week.value)
    const slides = callScenes(week.value).filter(
      (scene) => scene.section === "chapter"
    )
    expect(slides.length).toBeGreaterThan(0)
    const coarse = marks.filter((m) => m.slide !== true && m.finer !== true)
    expect(coarse.map((m) => m.title)).toEqual(
      week.value.asks.map((ask) => ask.question)
    )
    expect(marks.filter((m) => m.finer === true).map((m) => m.title)).toEqual([
      ...week.value.moved.map((each) => each.tag),
      ...week.value.done.map((each) => each.title),
      ...week.value.gray.map((each) => each.title),
      ...week.value.mine.map((each) => each.title),
    ])
  })

  it("count a finer mark only where the others make fewer than three (C391)", () => {
    const times = [
      at("intro", 0, 20_000),
      at("chapter-done", 20_000, 3_000),
      at("done-1", 23_000, 30_000),
      at("done-2", 53_000, 30_000),
      at("done-3", 83_000, 30_000),
    ]
    const marks = [
      { scene: "chapter-done", title: "What landed", slide: true },
      { scene: "done-1", title: "Voice", finer: true },
      { scene: "done-2", title: "Feed", finer: true },
      { scene: "done-3", title: "Jobs", finer: true },
    ]
    // The slide gives its start to the item after it, as to an ask.
    expect(chapterLines(chaptersOf(times, marks))).toBe(
      `0:00 ${OPENING}\n0:20 Voice\n0:53 Feed\n1:23 Jobs\n`
    )
    const enough = [
      ...marks.slice(0, 3),
      { scene: "done-3", title: "Waiting on you", slide: true },
    ]
    expect(chaptersOf(times, enough).map((c) => c.title)).toEqual([
      OPENING,
      "What landed",
      "Waiting on you",
    ])
  })
})

/**
 * Whether three chapters can start among the scenes' starts, the first at
 * 0:00, each ten seconds or more after the one before, the last ten seconds
 * or more before `endMs`: YouTube's rules, by every choice of starts.
 */
function threeCanStart(times: ReadonlyArray<ShotTime>, endMs: number): boolean {
  const starts = [...new Set(times.map((t) => t.startMs))].sort((a, b) => a - b)
  return starts.some((second) =>
    starts.some(
      (third) =>
        second >= 10_000 && third - second >= 10_000 && endMs - third >= 10_000
    )
  )
}

/** Each scene of `scenes` placed one after another, for as long as it is held. */
function estimatedTimes(
  scenes: ReadonlyArray<{ readonly id: string; readonly said: string }>
): Array<ShotTime> {
  let startMs = 0
  return scenes.map((scene) => {
    const durationMs = heldMs(scene)
    const time = at(scene.id, startMs, durationMs)
    startMs += durationMs
    return time
  })
}

/**
 * SFEED4's Family takes in how a series splits a week (#3032 widens it): a
 * part can fall inside one section, which has one chapter slide. Its
 * Tolerance: a part where no three of its starts (the opening, a section,
 * an item) lie ten seconds apart with the last ten before its end, such as
 * a part of one item, can have none under YouTube's rules; the recorder
 * says so in its log. Every other timing gets chapters, tried below.
 */
describe("a week split into parts (#3032)", () => {
  it("give a part chapters whenever three can start ten seconds apart", () => {
    // A small fixed generator, so every run tries the same timings.
    let seed = 7
    const next = (most: number): number => {
      // Park and Miller's: each product stays under 2^47, exact in a double.
      seed = (seed * 48_271) % 2_147_483_647
      return seed % most
    }
    const seen = new Set<boolean>()
    const counts = new Set<number>()
    for (let run = 0; run < 2_000; run += 1) {
      const times = [at("intro", 0, 1_000 + next(30_000))]
      let startMs = times[0]?.durationMs ?? 0
      times.push(at("chapter-done", startMs, 3_000))
      startMs += 3_000
      const items = 1 + next(4)
      counts.add(items)
      for (let i = 1; i <= items; i += 1) {
        const durationMs = 500 + next(40_000)
        times.push(at(`done-${String(i)}`, startMs, durationMs))
        startMs += durationMs
      }
      const marks = [
        { scene: "chapter-done", title: "What landed", slide: true },
        ...times
          .filter((t) => t.id.startsWith("done-"))
          .map((t) => ({ scene: t.id, title: t.id, finer: true })),
      ]
      const found = chaptersOf(times, marks).length >= FEWEST_CHAPTERS
      expect(found, JSON.stringify(times)).toBe(threeCanStart(times, startMs))
      seen.add(found)
    }
    // Both kinds of part were tried: some with chapters, some that can't.
    expect([...seen].sort()).toEqual([false, true])
    // And parts of one to four items.
    expect([...counts].sort()).toEqual([1, 2, 3, 4])
  })

  it("leave a part of one item with none, the Tolerance", () => {
    const times = [
      at("intro", 0, 20_000),
      at("chapter-done", 20_000, 3_000),
      at("done-1", 23_000, 600_000),
    ]
    const marks = [
      { scene: "chapter-done", title: "What landed", slide: true },
      { scene: "done-1", title: "Voice", finer: true },
    ]
    expect(chaptersFound(times, marks)).toHaveLength(2)
    expect(chaptersOf(times, marks)).toEqual([])
  })

  let nov6: CallWeek | null = null

  beforeAll(async () => {
    const raw = await readPinned(NOV_6_WEEK)
    if (raw === null) return
    const week = structuredClone(CallWeekSchema.parse(raw))
    week.template.version = 5
    nov6 = CallWeekSchema.parse(week)
  }, 60_000)

  it("gives every part of 30 seconds or more three chapters or more", (context) => {
    if (nov6 === null) return context.skip()
    const parts = callParts(nov6)
    // Nov 6's part 2 falls inside What landed, one section: the fixture.
    expect(parts.length).toBeGreaterThan(2)
    for (const part of parts) {
      const times = estimatedTimes(part.scenes)
      const end = times.reduce((ms, t) => ms + t.durationMs, 0)
      if (end < 30_000) continue
      const chapters = chaptersOf(times, callChapterMarks(nov6, part.n))
      expect(chapters.length, `part ${String(part.n)}`).toBeGreaterThanOrEqual(
        FEWEST_CHAPTERS
      )
    }
  })
})
