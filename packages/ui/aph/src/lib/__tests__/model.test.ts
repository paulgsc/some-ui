import type { Entry } from "@aph/lib/model"
import {
  awaitingTheirs,
  dueCheckpoint,
  formatDelta,
  formatValue,
  goalDelta,
  history,
  isMissed,
  needsAttention,
  nextCheckpoint,
  reconcile,
  stats,
} from "@aph/lib/model"
import { SEED_ENTRIES, SEED_SETTINGS } from "@aph/lib/seed"
import { describe, expect, it } from "vitest"

const settings = SEED_SETTINGS

function entry(patch: Partial<Entry>): Entry {
  return {
    id: "e",
    day: "2026-10-02",
    checkpoint: "12",
    time: null,
    mine: { value: 5000, approx: true },
    theirs: null,
    goal: 5100,
    labels: [],
    note: null,
    review: null,
    ...patch,
  }
}

describe("reconcile", () => {
  it("waits while their figure has not come in", () => {
    expect(reconcile(settings, entry({}))).toEqual({
      status: "awaiting",
      gap: null,
    })
  })

  it("settles by itself within the tolerance, either way", () => {
    expect(reconcile(settings, entry({ theirs: { value: 5100 } }))).toEqual({
      status: "matched",
      gap: 100,
    })
    expect(reconcile(settings, entry({ theirs: { value: 4900 } })).status).toBe(
      "matched"
    )
  })

  it("asks for my call past the tolerance, and keeps it once made", () => {
    const off = entry({ theirs: { value: 5400 } })
    expect(reconcile(settings, off)).toEqual({ status: "review", gap: 400 })
    expect(reconcile(settings, { ...off, review: "agreed" }).status).toBe(
      "agreed"
    )
    expect(reconcile(settings, { ...off, review: "flagged" }).status).toBe(
      "flagged"
    )
  })

  it("asks for a call on a reported figure I never wrote down", () => {
    expect(
      reconcile(settings, entry({ mine: null, theirs: { value: 5000 } }))
    ).toEqual({ status: "review", gap: null })
  })

  it("ignores a stale call once the figures agree", () => {
    expect(
      reconcile(settings, entry({ theirs: { value: 5000 }, review: "flagged" }))
        .status
    ).toBe("matched")
  })
})

describe("goalDelta", () => {
  it("measures theirs once reported, else mine", () => {
    expect(goalDelta(entry({}))).toBe(-100)
    expect(goalDelta(entry({ theirs: { value: 5600 } }))).toBe(500)
  })

  it("has none off the checkpoints", () => {
    expect(goalDelta(entry({ checkpoint: null, goal: null }))).toBeNull()
  })
})

describe("checkpoints over a day", () => {
  it("is due at noon once the morning is logged", () => {
    expect(
      dueCheckpoint(settings, SEED_ENTRIES, "2026-10-02", 12 * 60 + 4)?.id
    ).toBe("12")
  })

  it("opens a checkpoint 90 minutes early, and not before", () => {
    expect(dueCheckpoint(settings, [], "2026-10-03", 5 * 60 + 29)).toBeNull()
    expect(dueCheckpoint(settings, [], "2026-10-03", 5 * 60 + 30)?.id).toBe("7")
    expect(nextCheckpoint(settings, 8 * 60)?.id).toBe("12")
    expect(nextCheckpoint(settings, 11 * 60)).toBeNull()
  })
})

describe("entries waiting on their figure", () => {
  it("offer the latest checkpoint of the latest day first", () => {
    const seven = entry({ id: "seven", checkpoint: "7", goal: 4100 })
    const noon = entry({ id: "noon", checkpoint: "12" })
    const yesterday = entry({ id: "yesterday", day: "2026-10-01" })
    expect(
      awaitingTheirs(settings, [yesterday, seven, noon]).map((e) => e.id)
    ).toEqual(["noon", "seven", "yesterday"])
  })
})

describe("a checkpoint left unlogged", () => {
  it("is missed once its window closes, and not before", () => {
    const [seven] = settings.checkpoints
    if (seven === undefined) throw new Error("a morning checkpoint")
    expect(isMissed(seven, 8 * 60 + 30)).toBe(false)
    expect(isMissed(seven, 8 * 60 + 31)).toBe(true)
  })

  it("stays the one Home offers, late, while nothing later is open", () => {
    // 10:30: noon's window has opened, so noon is the one due; at 9:00 the
    // morning is still offered, though missed.
    expect(dueCheckpoint(settings, [], "2026-10-03", 9 * 60)?.id).toBe("7")
    expect(dueCheckpoint(settings, [], "2026-10-03", 10 * 60 + 30)?.id).toBe(
      "12"
    )
  })
})

describe("the paper notes", () => {
  const today = "2026-10-02"

  it("all wait on their figure, newest first", () => {
    const waiting = awaitingTheirs(settings, SEED_ENTRIES)
    expect(waiting).toHaveLength(SEED_ENTRIES.length)
    expect(waiting[0]?.day).toBe("2026-10-02")
    expect(needsAttention(settings, SEED_ENTRIES)).toEqual({
      review: 0,
      flagged: 0,
    })
  })

  it("fold missed days into gaps", () => {
    const rows = history(settings, SEED_ENTRIES, today)
    const gaps = rows.filter((r) => r.kind === "gap")
    expect(gaps.map((g) => [g.from, g.to, g.days])).toEqual([
      ["2026-09-30", "2026-09-30", 1],
      ["2026-09-26", "2026-09-27", 2],
      ["2026-09-21", "2026-09-21", 1],
      ["2026-09-19", "2026-09-19", 1],
      ["2026-09-14", "2026-09-15", 2],
    ])
    expect(rows.filter((r) => r.kind === "day")).toHaveLength(12)
  })

  it("average above the morning goal and below the noon one", () => {
    const s = stats(settings, SEED_ENTRIES, today)
    expect(s.loggedDays).toBe(12)
    expect(s.spanDays).toBe(19)
    const [seven, noon] = s.checkpoints
    if (seven === undefined || noon === undefined)
      throw new Error("two checkpoints")
    expect([seven.count, seven.average, seven.averageDelta]).toEqual([
      10, 4460, 360,
    ])
    // Sep 22's labelled second figure is a comparison, not the day's.
    expect(noon.count).toBe(7)
    expect(Math.round(noon.averageDelta ?? 0)).toBe(-329)
    expect(s.firstToSecond).toEqual({ median: 100, days: 7 })
  })

  it("compare a label only where a plain figure sits beside it", () => {
    const labels = stats(settings, SEED_ENTRIES, today).labels
    expect(labels.find((l) => l.label === "w/o office")).toEqual({
      label: "w/o office",
      tagged: 1,
      difference: -1000,
      pairs: 1,
    })
    expect(labels.find((l) => l.label === "no-bs")?.pairs).toBe(0)
  })
})

describe("formatting", () => {
  it("writes figures the way the notes do", () => {
    expect(formatValue(4300, true)).toBe("~4,300")
    expect(formatValue(4200)).toBe("4,200")
    expect(formatDelta(360)).toBe("+360")
    expect(formatDelta(-330)).toBe("−330")
    expect(formatDelta(0)).toBe("±0")
  })
})
