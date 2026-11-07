import type { Week } from "@rust-rounds/lib/formats/week"
import { QUILLMOSS_WEEK } from "@rust-rounds/lib/sample-week"
import {
  describeWeekProblem,
  isoWeekId,
  readWeek,
} from "@rust-rounds/lib/week-check"
import { describe, expect, it } from "vitest"

const [QM311, QM312, QM313] = QUILLMOSS_WEEK.tickets
if (QM311 === undefined || QM312 === undefined || QM313 === undefined) {
  throw new Error("the sample week changed shape")
}

/** The sample week with some fields replaced; the result may be malformed. */
const weekWith = (fields: Record<string, unknown>): unknown => ({
  ...QUILLMOSS_WEEK,
  ...fields,
})

/** The sample week with its first ticket's fields replaced. */
const firstTicketWith = (fields: Record<string, unknown>): unknown =>
  weekWith({ tickets: [{ ...QM311, ...fields }, QM312, QM313] })

/** Every reason `value` is refused, as `at: why`; empty when it is read. */
const refused = (value: unknown): Array<string> => {
  const reading = readWeek(value)
  return reading.ok ? [] : reading.problems.map(describeWeekProblem)
}

const FIRST = 'tickets[0] ("QM-311")'

describe("readWeek", () => {
  it("reads the sample week as written", () => {
    expect(readWeek(QUILLMOSS_WEEK)).toEqual({ ok: true, week: QUILLMOSS_WEEK })
  })

  it("refuses a ticket with one speak-to point, or four", () => {
    expect(refused(firstTicketWith({ speakTo: ["Only this"] }))).toEqual([
      `${FIRST}.speakTo: a ticket has 2 or 3 speak-to points`,
    ])
    expect(refused(firstTicketWith({ speakTo: ["a", "b", "c", "d"] }))).toEqual(
      [`${FIRST}.speakTo: a ticket has 2 or 3 speak-to points`]
    )
  })

  it("refuses a ticket that names no concept", () => {
    expect(refused(firstTicketWith({ concepts: [] }))).toEqual([
      `${FIRST}.concepts: name every concept the ticket touches, at least one`,
    ])
  })

  it("refuses a concept id with two names", () => {
    expect(
      refused(
        weekWith({
          tickets: [
            QM311,
            {
              ...QM312,
              concepts: [{ id: "lifetime-elision", name: "Elision" }],
            },
            QM313,
          ],
        })
      )
    ).toEqual([
      'tickets[1] ("QM-312").concepts[0].name: concept "lifetime-elision" is named "Lifetime elision" elsewhere in the week; one id, one name',
    ])
  })

  it("refuses a program line wider than the phone shows, a tab, or too many lines", () => {
    const wide = `fn main() { let _ = "${"x".repeat(30)}"; }\n`
    expect(refused(firstTicketWith({ program: wide }))).toEqual([
      `${FIRST}.program: line 1: 55 columns wide; keep every line to 40, since code on the phone never wraps.`,
    ])
    expect(
      refused(firstTicketWith({ program: "fn main() {\n\tlet _x = 1;\n}\n" }))
    ).toEqual([`${FIRST}.program: line 2: indent with spaces, not a tab.`])
    const long = `fn main() {\n${"    let _x = 1;\n".repeat(25)}}\n`
    expect(refused(firstTicketWith({ program: long }))).toEqual([
      `${FIRST}.program: the program is 27 lines; keep it to 25 or fewer.`,
    ])
  })

  it("refuses a deadline before the week opens", () => {
    expect(
      refused(
        weekWith({
          opens: "2026-11-16T00:00:00-08:00",
          due: "2026-11-15T23:59:00-08:00",
          id: "2026-w47",
        })
      )
    ).toEqual(["due: the deadline must come after the week opens"])
  })

  it("refuses a deadline past the week's Sunday", () => {
    expect(refused(weekWith({ due: "2026-11-22T23:59:00-08:00" }))).toEqual([
      "due: the deadline must fall in the week that opens: the Sunday after `opens`",
    ])
  })

  it("refuses a deadline that isn't Sunday 23:59 in the owner's time", () => {
    expect(refused(weekWith({ due: "2026-11-15T23:59:00Z" }))).toEqual([
      "due: a week is due Sunday 23:59 in America/Los_Angeles; this is 2026-11-15 15:59 there",
    ])
  })

  it("refuses a week that doesn't open Monday 00:00 in the owner's time", () => {
    expect(refused(weekWith({ opens: "2026-11-10T00:00:00-08:00" }))).toEqual([
      "opens: a week opens Monday 00:00 in America/Los_Angeles; this is 2026-11-10 00:00 there",
    ])
  })

  it("refuses an id that isn't the week it opens", () => {
    expect(refused(weekWith({ id: "2026-w45" }))).toEqual([
      "id: the week that opens 2026-11-09 is 2026-w46; use that as its id",
    ])
  })

  it("refuses two tickets with one id", () => {
    expect(
      refused(weekWith({ tickets: [QM311, { ...QM312, id: "QM-311" }, QM313] }))
    ).toEqual([
      'tickets[1] ("QM-311").id: ticket "QM-311" is used twice; each must be unique',
    ])
  })

  it("refuses a reference named twice", () => {
    expect(
      refused(weekWith({ references: ["rust-reference", "rust-reference"] }))
    ).toEqual(['references[1]: "rust-reference" is named twice'])
  })

  it("gives every problem at once, so a tutor fixes them in one pass", () => {
    const week: Week = {
      ...QUILLMOSS_WEEK,
      id: "2026-w45",
      due: "2026-11-15T12:00:00-08:00",
    }
    expect(refused(week)).toHaveLength(2)
  })
})

describe("isoWeekId", () => {
  it("follows ISO 8601 at the year's edges", () => {
    expect(isoWeekId("2026-01-01")).toBe("2026-w01")
    expect(isoWeekId("2025-12-29")).toBe("2026-w01")
    expect(isoWeekId("2027-01-03")).toBe("2026-w53")
  })
})
