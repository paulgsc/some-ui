import { MACHINERY } from "@topik/lib/topik/read-aloud/__tests__/machinery"
import type { EntryRole } from "@topik/lib/topik/read-aloud/set-machine"
import { TALLY_WORDS } from "@topik/lib/topik/read-aloud/tally-words"
import { describe, expect, it } from "vitest"

const TODAY = "2026-10-21"
const ROW = {
  first: "2026-10-19T12:00:00.000Z",
  last: "2026-10-21T12:00:00.000Z",
  shown: 3,
  read: 2,
}

describe("the sentence's words", () => {
  it("says a date beside today as a person does", () => {
    // Noon on each day keeps every timezone on that local day.
    expect(TALLY_WORDS.date("2026-10-21T12:00:00", TODAY)).toBe("today")
    expect(TALLY_WORDS.date("2026-10-20T12:00:00", TODAY)).toBe("yesterday")
    expect(TALLY_WORDS.date("2026-10-05T12:00:00", TODAY)).toBe("Oct 5")
    expect(TALLY_WORDS.date("2025-12-31T12:00:00", TODAY)).toBe("Dec 31, 2025")
    expect(TALLY_WORDS.date("2026-09-30T12:00:00", "2026-10-01")).toBe(
      "yesterday"
    )
  })

  it("counts what was shown and read, with the noun agreeing", () => {
    expect(TALLY_WORDS.shown({ ...ROW, shown: 1 })).toBe("once")
    expect(TALLY_WORDS.shown(ROW)).toBe("3 times")
    expect(TALLY_WORDS.read({ ...ROW, read: 0 })).toBe("Not yet")
    expect(TALLY_WORDS.read({ ...ROW, read: 1 })).toBe("once")
    expect(TALLY_WORDS.read(ROW)).toBe("2 times")
  })

  it("says why a sentence is here: back after a stuck report, or a repeat once all were shown", () => {
    expect(TALLY_WORDS.why("return", "fresh")).toBe(
      "You marked it stuck, so it came back."
    )
    expect(TALLY_WORDS.why("rep", "repeat")).toBe(
      "Every sentence had been shown, so the one shown longest ago came back."
    )
    expect(TALLY_WORDS.why("rep", "fresh")).toBe(
      "I hadn't shown it yet this sitting."
    )
    expect(TALLY_WORDS.why("rep", null)).toBeNull()
  })

  it("says what is kept where and since when, and when it could not be kept", () => {
    expect(TALLY_WORDS.kept(ROW.first, "2026-10-21", true)).toBe(
      "Kept on this phone, since Oct 19."
    )
    expect(TALLY_WORDS.kept(ROW.first, "2026-10-21", false)).toBe(
      "This phone couldn't keep this, so it lasts only until you close it."
    )
  })

  it("says what a clear takes and what stays, with the noun agreeing", () => {
    expect(TALLY_WORDS.clear.goes(54, ROW.first, TODAY)).toBe(
      "This clears when 54 sentences were shown and read to the end, since Oct 19. Your practice record stays."
    )
    expect(TALLY_WORDS.clear.goes(1, ROW.first, TODAY)).toContain(
      "1 sentence was shown"
    )
    expect(TALLY_WORDS.clear.kept(54, ROW.first, TODAY)).toBe(
      "Kept on this phone: when 54 sentences were shown and read to the end, since Oct 19."
    )
    expect(TALLY_WORDS.clear.kept(1, ROW.first, TODAY)).toContain(
      "1 sentence was shown"
    )
  })

  it("never reaches for the machinery's terms", () => {
    expect("a tally of stored rows".match(MACHINERY)).not.toBeNull()
    const roles: Array<EntryRole> = ["rep", "return", "introduction"]
    const words = [
      TALLY_WORDS.mark("new"),
      TALLY_WORDS.mark("seen"),
      TALLY_WORDS.openFacts("new"),
      TALLY_WORDS.openFacts("seen"),
      TALLY_WORDS.title,
      TALLY_WORDS.holding,
      TALLY_WORDS.done,
      ...Object.values(TALLY_WORDS.labels),
      TALLY_WORDS.shown(ROW),
      TALLY_WORDS.read(ROW),
      TALLY_WORDS.read({ ...ROW, read: 0 }),
      ...roles.flatMap((role) =>
        (["fresh", "repeat", null] as const).flatMap(
          (begun) => TALLY_WORDS.why(role, begun) ?? []
        )
      ),
      TALLY_WORDS.kept(ROW.first, TODAY, true),
      TALLY_WORDS.kept(ROW.first, TODAY, false),
      ...[1, 54].flatMap((size) => [
        TALLY_WORDS.clear.kept(size, ROW.first, TODAY),
        TALLY_WORDS.clear.goes(size, ROW.first, TODAY),
      ]),
      TALLY_WORDS.clear.ask,
      TALLY_WORDS.clear.askName,
      TALLY_WORDS.clear.title,
      TALLY_WORDS.clear.confirm,
      TALLY_WORDS.clear.cleared,
      TALLY_WORDS.clear.notCleared,
    ]
    for (const line of words) expect(line).not.toMatch(MACHINERY)
  })
})
