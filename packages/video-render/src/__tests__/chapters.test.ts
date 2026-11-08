import {
  callChapterMarks,
  callScenes,
  sampleCallWeek,
} from "@video-render/call"
import {
  chapterLines,
  chaptersOf,
  OPENING,
  stamp,
} from "@video-render/chapters"
import type { ShotTime } from "@video-render/timing"
import { describe, expect, it } from "vitest"

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
    expect(marks.filter((m) => m.slide !== true).map((m) => m.title)).toEqual(
      week.value.asks.map((ask) => ask.question)
    )
  })
})
