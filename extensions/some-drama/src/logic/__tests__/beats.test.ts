import {
  applyBeat,
  curvePath,
  decayMs,
  episodeBeats,
  episodeCurve,
  latestEpisode,
  logBeat,
  MAX_BEATS,
  normalizeEpisode,
  parseEpisode,
  REPEAT_WINDOW_MS,
} from "@drama/logic/beats"
import type { BeatInput } from "@drama/logic/beats"
import type { BeatRecord } from "@drama/types"
import { describe, expect, it } from "vitest"

const press = (over: Partial<BeatInput> = {}): BeatInput => ({
  id: "b1",
  dramaId: "d1",
  dramaTitle: "Drama",
  episode: "Ep 3",
  mood: "love",
  videoTime: 600,
  duration: 2400,
  at: 1_000,
  ...over,
})

const beat = (over: Partial<BeatRecord> = {}): BeatRecord => ({
  id: "b",
  dramaId: "d1",
  dramaTitle: "Drama",
  episode: "Ep 3",
  mood: "love",
  intensity: 1,
  videoTime: 600,
  duration: 2400,
  capturedAt: 1_000,
  updatedAt: 1_000,
  ...over,
})

describe("applyBeat", () => {
  const snapshot = { episode: "Ep 3", beats: [beat({ id: "a" })] }

  it("appends a new beat, and replaces the one an escalation updates", () => {
    const added = applyBeat(snapshot, beat({ id: "b" }))
    expect(added.beats.map((b) => b.id)).toEqual(["a", "b"])
    const escalated = applyBeat(added, beat({ id: "a", intensity: 2 }))
    expect(escalated.beats.map((b) => b.intensity)).toEqual([2, 1])
  })

  it("starts a beat's episode afresh when it is another episode", () => {
    expect(applyBeat(snapshot, beat({ id: "c", episode: "Ep 4" }))).toEqual({
      episode: "Ep 4",
      beats: [beat({ id: "c", episode: "Ep 4" })],
    })
  })

  it("leaves the snapshot it was given unchanged", () => {
    applyBeat(snapshot, beat({ id: "b" }))
    expect(snapshot.beats).toHaveLength(1)
  })
})

describe("logBeat", () => {
  it("logs a first press as a new intensity-1 beat", () => {
    const { beats, beat: b, escalated } = logBeat([], press())
    expect(escalated).toBe(false)
    expect(beats).toEqual([b])
    expect(b).toMatchObject({
      intensity: 1,
      capturedAt: 1_000,
      updatedAt: 1_000,
    })
  })

  it("escalates a repeat press of the same mood inside the window", () => {
    const first = logBeat([], press())
    const second = logBeat(
      first.beats,
      press({ id: "b2", at: 2_500, videoTime: 602 })
    )
    const third = logBeat(second.beats, press({ id: "b3", at: 4_000 }))
    const fourth = logBeat(third.beats, press({ id: "b4", at: 5_000 }))

    expect(second.escalated).toBe(true)
    expect(fourth.beats).toHaveLength(1)
    // Anchored at the first press, capped at 3, window chained from the last press.
    expect(fourth.beat).toMatchObject({
      id: "b1",
      videoTime: 600,
      intensity: 3,
      capturedAt: 1_000,
      updatedAt: 5_000,
    })
  })

  it("logs a new beat once the window has passed", () => {
    const first = logBeat([], press())
    const late = logBeat(
      first.beats,
      press({ id: "b2", at: 1_000 + REPEAT_WINDOW_MS + 1 })
    )
    expect(late.escalated).toBe(false)
    expect(late.beats).toHaveLength(2)
  })

  it("does not escalate across a different mood, episode or drama", () => {
    const first = logBeat([], press())
    for (const over of [
      { mood: "sadness" },
      { episode: "Ep 4" },
      { dramaId: "d2" },
    ] as const) {
      expect(
        logBeat(first.beats, press({ id: "x", at: 1_500, ...over })).escalated
      ).toBe(false)
    }
  })

  it("keeps the log bounded", () => {
    const full = Array.from({ length: MAX_BEATS }, (_, i) =>
      beat({ id: `b${i}`, mood: i % 2 ? "joy" : "sadness", updatedAt: i })
    )
    const { beats } = logBeat(full, press({ id: "new", at: 10 ** 9 }))
    expect(beats).toHaveLength(MAX_BEATS)
    expect(beats[0]?.id).toBe("b1")
    expect(beats.at(-1)?.id).toBe("new")
  })
})

describe("episodeCurve", () => {
  it("places timed beats by position in the episode, sorted", () => {
    const pts = episodeCurve([
      beat({ id: "late", videoTime: 1800, mood: "sadness", intensity: 3 }),
      beat({ id: "early", videoTime: 600, mood: "love", intensity: 1 }),
    ])
    expect(pts.map((p) => p.beat.id)).toEqual(["early", "late"])
    expect(pts[0]).toMatchObject({ x: 0.25, y: 1 / 3 })
    expect(pts[1]).toMatchObject({ x: 0.75, y: -1 })
  })

  it("falls back to even spacing when any beat lacks a video time", () => {
    const pts = episodeCurve([
      beat({ id: "a" }),
      beat({ id: "b", videoTime: null }),
      beat({ id: "c" }),
    ])
    expect(pts.map((p) => p.x)).toEqual([0, 0.5, 1])
  })

  it("centres a lone untimed beat", () => {
    expect(episodeCurve([beat({ videoTime: null })])[0]?.x).toBe(0.5)
  })
})

describe("curvePath", () => {
  it("runs from the baseline to the latest point, and stops there", () => {
    const d = curvePath(
      episodeCurve([beat({ mood: "love", intensity: 3, videoTime: 1200 })]),
      100,
      40
    )
    expect(d).toBe("M0 20.0 L50.0 0.0")
  })

  it("draws nothing before the first beat", () => {
    expect(curvePath([], 100, 40)).toBe("")
  })
})

describe("episodes", () => {
  it("parses the usual title forms", () => {
    expect(parseEpisode("Love Between Fairy and Devil EP 12 | Viki")).toBe(
      "Ep 12"
    )
    expect(parseEpisode("Episode 03")).toBe("Ep 3")
    expect(parseEpisode("눈물의 여왕 5화")).toBe("Ep 5")
    expect(parseEpisode("苍兰诀 第7集")).toBe("Ep 7")
    expect(parseEpisode("Sleepless in Seattle")).toBe("")
  })

  it("normalizes catalog labels to the same form", () => {
    expect(normalizeEpisode("Ep 03")).toBe("Ep 3")
    expect(normalizeEpisode(" 12 ")).toBe("Ep 12")
    expect(normalizeEpisode("Finale")).toBe("Finale")
  })

  it("filters one episode and finds the latest", () => {
    const log = [
      beat({ episode: "Ep 3" }),
      beat({ episode: "Ep 4" }),
      beat({ dramaId: "d2", episode: "Ep 9" }),
    ]
    expect(episodeBeats(log, "d1", "Ep 3")).toHaveLength(1)
    expect(latestEpisode(log, "d1", "Ep 1")).toBe("Ep 4")
    expect(latestEpisode(log, "d3", "Ep 1")).toBe("Ep 1")
  })
})

describe("decayMs", () => {
  it("lingers longer the harder it hit", () => {
    expect(decayMs(1)).toBeLessThan(decayMs(2))
    expect(decayMs(2)).toBeLessThan(decayMs(3))
  })
})
