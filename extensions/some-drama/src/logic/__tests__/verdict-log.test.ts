import {
  dramaVerdicts,
  FOLD_WINDOW_MS,
  logVerdict,
  MAX_VERDICTS,
  trendPath,
  verdictTrend,
} from "@drama/logic/verdict-log"
import type { VerdictInput } from "@drama/logic/verdict-log"
import type { VerdictRecord } from "@drama/types"
import { describe, expect, it } from "vitest"

let n = 0
const change = (over: Partial<VerdictInput> = {}): VerdictInput => ({
  id: `v${++n}`,
  dramaId: "d1",
  dramaTitle: "Queen of Tears",
  episode: "Ep 3",
  field: "rating",
  from: 7,
  to: 7.5,
  videoTime: 600,
  at: 1_000_000,
  ...over,
})

function replay(inputs: Array<VerdictInput>): Array<VerdictRecord> {
  return inputs.reduce<Array<VerdictRecord>>(
    (log, i) => logVerdict(log, i).verdicts,
    []
  )
}

describe("logVerdict", () => {
  it("folds quick steps of one verdict into one change", () => {
    const log = replay([
      change({ from: 7, to: 7.5, at: 0 }),
      change({ from: 7.5, to: 8, at: 400, videoTime: 604 }),
      change({ from: 8, to: 9, at: 900, videoTime: 609 }),
    ])
    expect(log).toHaveLength(1)
    // Anchored where it started: the first press's value and video time.
    expect(log[0]).toMatchObject({ from: 7, to: 9, videoTime: 600, at: 900 })
  })

  it("drops a change folded back to where it started", () => {
    const first = logVerdict([], change({ from: 7, to: 7.5, at: 0 }))
    const back = logVerdict(
      first.verdicts,
      change({ from: 7.5, to: 7, at: 300 })
    )
    expect(back.verdicts).toEqual([])
    expect(back.verdict).toBeNull()
  })

  it("keeps changes apart across the window, verdicts, dramas and episodes", () => {
    const log = replay([
      change({ at: 0 }),
      change({ at: FOLD_WINDOW_MS + 1 }),
      change({ at: FOLD_WINDOW_MS + 2, field: "completionLikelihood" }),
      change({ at: FOLD_WINDOW_MS + 3, dramaId: "d2" }),
      change({ at: FOLD_WINDOW_MS + 4, dramaId: "d2", episode: "Ep 4" }),
    ])
    expect(log).toHaveLength(5)
  })

  it("does not log a change to the value it already had", () => {
    expect(logVerdict([], change({ from: 8, to: 8 })).verdicts).toEqual([])
  })

  it("logs a new drama's first value with no from", () => {
    expect(logVerdict([], change({ from: null, to: 6 })).verdict).toMatchObject(
      {
        from: null,
        to: 6,
      }
    )
  })

  it("stays bounded", () => {
    const full = Array.from({ length: MAX_VERDICTS }, (_, i) => ({
      ...change({ at: i * FOLD_WINDOW_MS * 2 }),
      from: 1,
    }))
    const next = logVerdict(full, change({ at: 1e12 }))
    expect(next.verdicts).toHaveLength(MAX_VERDICTS)
    expect(next.verdicts.at(-1)?.at).toBe(1e12)
  })
})

describe("verdictTrend", () => {
  const log = replay([
    change({ from: null, to: 6, episode: "Ep 1", at: 0 }),
    change({ from: 6, to: 7, episode: "Ep 2", at: 1e6 }),
    change({ from: 7, to: 6.5, episode: "Ep 2", at: 2e6 }),
    change({ from: 0.5, to: 0.9, field: "completionLikelihood", at: 3e6 }),
    change({ from: 6.5, to: 9, episode: "Ep 5", at: 4e6 }),
  ])

  it("is the value at the end of each episode's changes, in order", () => {
    expect(verdictTrend(log, "rating")).toEqual([
      { episode: "Ep 1", value: 6 },
      { episode: "Ep 2", value: 6.5 },
      { episode: "Ep 5", value: 9 },
    ])
  })

  it("starts from where the verdict was before its first change", () => {
    expect(verdictTrend(log, "completionLikelihood")).toEqual([
      { episode: "Ep 3", value: 0.5 },
      { episode: "Ep 3", value: 0.9 },
    ])
  })

  it("keeps one drama's changes", () => {
    const two = [...log, { ...change({ dramaId: "d2" }), from: 1 }]
    expect(dramaVerdicts(two, "d2")).toHaveLength(1)
  })
})

describe("trendPath", () => {
  it("spreads points over the width, top is max", () => {
    const d = trendPath(
      [
        { episode: "Ep 1", value: 0 },
        { episode: "Ep 2", value: 10 },
      ],
      10,
      56,
      14
    )
    expect(d).toBe("M0,14 L56,0")
  })

  it("is empty with fewer than two points", () => {
    expect(trendPath([{ episode: "Ep 1", value: 5 }], 10, 56, 14)).toBe("")
  })
})
