import type { Draft, DraftEvent } from "@aph/lib/draft"
import {
  commitDraft,
  draftValue,
  newDraft,
  reviewEntry,
  stepDraft,
} from "@aph/lib/draft"
import { reconcile } from "@aph/lib/model"
import { SEED_ENTRIES, SEED_SETTINGS } from "@aph/lib/seed"
import { describe, expect, it } from "vitest"

const settings = SEED_SETTINGS

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value")
  return value
}
const commit = { day: "2026-10-02", time: "16:05", id: "new" }

function run(draft: Draft, events: ReadonlyArray<DraftEvent>): Draft {
  return events.reduce(stepDraft, draft)
}

const typed = (digits: string): Array<DraftEvent> =>
  [...digits].map((digit) => ({ type: "digit", digit }))

describe("typing a figure", () => {
  it("takes digits up to five, and backs off one", () => {
    const d = run(newDraft("mine", "12", null), [
      ...typed("460000"),
      { type: "backspace" },
    ])
    expect(draftValue(d)).toBe(4600)
  })

  it("steps from the goal when nothing is typed yet", () => {
    const d = run(newDraft("mine", "12", null), [
      { type: "nudge", by: -100, base: 5100 },
    ])
    expect(draftValue(d)).toBe(5000)
  })

  it("starts over when switching sides", () => {
    const d = run(newDraft("mine", "12", null), [
      ...typed("4600"),
      { type: "side", side: "theirs" },
    ])
    expect(d.side).toBe("theirs")
    expect(draftValue(d)).toBeNull()
  })
})

describe("saving mine", () => {
  it("adds an entry that keeps the goal it was made under", () => {
    const d = run(newDraft("mine", "12", null), [
      ...typed("4600"),
      { type: "toggleLabel", label: "no-bs" },
    ])
    const saved = commitDraft(settings, SEED_ENTRIES, d, commit)?.at(-1)
    expect(saved).toMatchObject({
      id: "new",
      day: "2026-10-02",
      checkpoint: "12",
      time: null,
      mine: { value: 4600, approx: true },
      goal: 5100,
      labels: ["no-bs"],
    })
  })

  it("keeps the clock time off the checkpoints, with no goal", () => {
    const d = run(newDraft("mine", null, null), typed("4700"))
    expect(commitDraft(settings, [], d, commit)?.[0]).toMatchObject({
      checkpoint: null,
      time: "16:05",
      goal: null,
    })
  })

  it("fills in an entry that only had their figure", () => {
    const reported = {
      ...must(SEED_ENTRIES[0]),
      id: "r",
      day: "2026-10-02",
      checkpoint: "12",
      mine: null,
      theirs: { value: 4650 },
    }
    const d = run(newDraft("mine", "12", null), typed("4600"))
    const after = commitDraft(settings, [reported], d, commit) ?? []
    expect(after).toHaveLength(1)
    expect(reconcile(settings, must(after[0])).status).toBe("matched")
  })

  it("corrects the plain figure already logged there, rather than adding a second", () => {
    // Oct 2 at 7:00 is logged (~4,300) and their figure flagged against it.
    const target = must(
      SEED_ENTRIES.find((e) => e.day === "2026-10-02" && e.checkpoint === "7")
    )
    const before = reviewEntry(
      SEED_ENTRIES.map((e) =>
        e.id === target.id ? { ...e, theirs: { value: 4900 } } : e
      ),
      target.id,
      "flagged"
    )
    const d = run(newDraft("mine", "7", null), typed("4850"))
    const after = commitDraft(settings, before, d, commit) ?? []
    expect(after).toHaveLength(before.length)
    const fixed = must(after.find((e) => e.id === target.id))
    expect(fixed.mine).toEqual({ value: 4850, approx: true })
    expect(reconcile(settings, fixed).status).toBe("matched")
  })

  it("adds a labelled figure beside the plain one, as a comparison", () => {
    const d = run(newDraft("mine", "7", null), [
      ...typed("4100"),
      { type: "toggleLabel", label: "no-bs" },
    ])
    const after = commitDraft(settings, SEED_ENTRIES, d, commit) ?? []
    expect(after).toHaveLength(SEED_ENTRIES.length + 1)
  })

  it("saves nothing without a figure", () => {
    expect(
      commitDraft(settings, [], newDraft("mine", "7", null), commit)
    ).toBeNull()
  })
})

describe("saving theirs", () => {
  const target = must(SEED_ENTRIES.at(-1))

  it("lands on the entry it was for, and clears an old call", () => {
    const flagged = reviewEntry(SEED_ENTRIES, target.id, "flagged")
    const d = run(newDraft("theirs", null, target.id), typed("4900"))
    const after = commitDraft(settings, flagged, d, commit) ?? []
    const landed = after.find((e) => e.id === target.id)
    expect(landed?.theirs).toEqual({ value: 4900 })
    expect(landed?.review).toBeNull()
    expect(reconcile(settings, landed ?? target)).toEqual({
      status: "review",
      gap: 600,
    })
  })

  it("saves nothing for an entry that is not there", () => {
    const d = run(newDraft("theirs", null, "gone"), typed("4900"))
    expect(commitDraft(settings, SEED_ENTRIES, d, commit)).toBeNull()
  })
})
