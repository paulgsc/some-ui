/**
 * The owner's picks and step marks as this phone keeps them (RR25, RR29):
 * each appended through `lib/decisions` and `lib/flow`, and never dropped or
 * rewritten once kept.
 */
import { pick } from "@rust-rounds/lib/decisions"
import { flowSteps, mark } from "@rust-rounds/lib/flow"
import { TALLOWBROOK_WEEK_FILE } from "@rust-rounds/lib/sample-week/tallowbrook"
import { readWeek } from "@rust-rounds/lib/week-check"
import { weekMarks, weekPicks } from "@rust-rounds/lib/week-play/store"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

const read = readWeek(TALLOWBROOK_WEEK_FILE)
if (!read.ok) throw new Error("the /2 sample reads")
const WEEK = read.week
const AT = "2026-11-19T10:00:00Z"

describe("the picks kept", () => {
  it("keeps each pick, a week's apart from another's, and only grows", () => {
    const storage = inMemoryStorage()
    const picks = weekPicks(storage)
    const made = {
      ticket: "TB-101",
      fork: 1,
      pick: { kind: "option", option: "B" },
      at: AT,
    } as const
    const kept = picks.keep((all) => [
      ...all,
      ...pick(WEEK, [], made).map((each) => ({ ...each, week: WEEK.id })),
    ])
    expect(kept).toEqual([{ ...made, week: WEEK.id }])
    // Read again from what was written.
    expect(weekPicks(storage).list()).toEqual(kept)
    // A change that drops or rewrites a pick kept is refused.
    expect(picks.keep(() => [])).toBeNull()
    expect(
      picks.keep((all) =>
        all.map((each) => ({ ...each, pick: { kind: "own" } as const }))
      )
    ).toBeNull()
    expect(weekPicks(storage).list()).toEqual(kept)
  })
})

describe("the marks kept", () => {
  it("keeps each mark and only grows", () => {
    const storage = inMemoryStorage()
    const marks = weekMarks(storage)
    const steps = flowSteps(WEEK)
    const skipped = {
      ticket: "TB-101",
      step: "academy",
      mark: "skipped",
      at: AT,
    } as const
    const done = {
      ...skipped,
      mark: "done",
      at: "2026-11-19T11:00:00Z",
    } as const
    const first = marks.keep((all) => [
      ...all,
      ...mark(steps, [], skipped).map((each) => ({ ...each, week: WEEK.id })),
    ])
    const second = marks.keep((all) => [
      ...all,
      ...mark(steps, all, done)
        .slice(all.length)
        .map((each) => ({ ...each, week: WEEK.id })),
    ])
    expect(first).toHaveLength(1)
    expect(second).toEqual([
      { ...skipped, week: WEEK.id },
      { ...done, week: WEEK.id },
    ])
    expect(marks.keep((all) => all.slice(1))).toBeNull()
  })
})
