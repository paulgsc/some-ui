import type {
  Exercise,
  ForkOption,
  WeekV1,
  WeekV2,
} from "@rust-rounds/lib/formats/week"
import {
  QUILLMOSS_WEEK,
  QUILLMOSS_WEEK_FILE,
} from "@rust-rounds/lib/sample-week"
import { TALLOWBROOK_WEEK_FILE } from "@rust-rounds/lib/sample-week/tallowbrook"
import {
  describeWeekProblem,
  isoWeekId,
  readWeek,
} from "@rust-rounds/lib/week-check"
import { describe, expect, it } from "vitest"

type Ticket2 = WeekV2["tickets"][number]
type Fork2 = Ticket2["forks"][number]

const [QM311, QM312, QM313] = QUILLMOSS_WEEK_FILE.tickets
if (QM311 === undefined || QM312 === undefined || QM313 === undefined) {
  throw new Error("the sample week changed shape")
}

/** The sample week with some fields replaced; the result may be malformed. */
const weekWith = (fields: Record<string, unknown>): unknown => ({
  ...QUILLMOSS_WEEK_FILE,
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
    expect(readWeek(QUILLMOSS_WEEK_FILE)).toEqual({
      ok: true,
      week: QUILLMOSS_WEEK,
    })
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

  it("refuses a deadline that isn't the Sunday of the week that opens", () => {
    for (const due of [
      "2026-11-08T23:59:00-08:00",
      "2026-11-22T23:59:00-08:00",
    ]) {
      expect(refused(weekWith({ due }))).toEqual([
        "due: the deadline must be the Sunday of the week that opens, 2026-11-15",
      ])
    }
  })

  it("reads the week daylight saving ends, an hour past seven days", () => {
    const week = weekWith({
      id: "2026-w44",
      opens: "2026-10-26T00:00:00-07:00",
      due: "2026-11-01T23:59:00-08:00",
    })
    expect(refused(week)).toEqual([])
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
    const week: WeekV1 = {
      ...QUILLMOSS_WEEK_FILE,
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

/**
 * A `/2` week (RR25, RR29): what it says of its forks, options, stated
 * constraints and academy is held to the week (C692, C694, C696).
 */
describe("readWeek, a /2 week", () => {
  /** The `/2` sample, edited by `change`; the result may be malformed. */
  const edited = (change: (week: WeekV2) => void): unknown => {
    const week = structuredClone(TALLOWBROOK_WEEK_FILE)
    change(week)
    return week
  }
  /** What `value` holds, or a failure: the sample changed shape. */
  const must = <T>(value: T | undefined): T => {
    if (value === undefined) throw new Error("the /2 sample changed shape")
    return value
  }
  const ticketOf = (week: WeekV2, t: number): Ticket2 => must(week.tickets[t])
  const forkOf = (week: WeekV2, t: number, f: number): Fork2 =>
    must(ticketOf(week, t).forks[f])
  const optionOf = (
    week: WeekV2,
    t: number,
    f: number,
    o: number
  ): ForkOption => must(forkOf(week, t, f).options[o])
  const exerciseOf = (week: WeekV2, t: number, e: number): Exercise =>
    must(ticketOf(week, t).academy[e])
  const TB101 = 'tickets[0] ("TB-101")'

  it("reads the sample, held as written", () => {
    expect(readWeek(TALLOWBROOK_WEEK_FILE)).toEqual({
      ok: true,
      week: TALLOWBROOK_WEEK_FILE,
    })
  })

  it("refuses a fork with no option recommended, or two", () => {
    const none = edited((week) => {
      optionOf(week, 0, 0, 0).recommended = false
    })
    const two = edited((week) => {
      optionOf(week, 0, 0, 1).recommended = true
    })
    for (const [value, n] of [
      [none, 0],
      [two, 2],
    ] as const) {
      expect(refused(value)).toEqual([
        `${TB101}.forks[0]: exactly one option is recommended, as an agent marks it; this fork has ${n}`,
      ])
    }
  })

  it("refuses an option citing a constraint the week doesn't state for its ticket", () => {
    const unstated = edited((week) => {
      optionOf(week, 0, 0, 0).cites = ["S9"]
    })
    // F3 is TB-102's figure: stated, but not for TB-101.
    const elsewhere = edited((week) => {
      optionOf(week, 0, 0, 0).cites = ["S1", "F3"]
    })
    expect(refused(unstated)).toEqual([
      `${TB101}.forks[0].options[0] ("A").cites[0]: "S9" is not a constraint this week states for this ticket: cite the SLA's rows or the ticket's own figures`,
    ])
    expect(refused(elsewhere)).toEqual([
      `${TB101}.forks[0].options[0] ("A").cites[1]: "F3" is not a constraint this week states for this ticket: cite the SLA's rows or the ticket's own figures`,
    ])
  })

  it("refuses an option citing nothing, and a fork of one option", () => {
    const nothing = edited((week) => {
      optionOf(week, 0, 0, 0).cites = []
    })
    const lone = edited((week) => {
      forkOf(week, 0, 1).options.splice(1)
    })
    expect(refused(nothing)).toEqual([
      `${TB101}.forks[0].options[0] ("A").cites: an option cites at least one stated constraint, by id`,
    ])
    expect(refused(lone)).toEqual([
      `${TB101}.forks[1].options: a fork has 2 to 6 options`,
    ])
  })

  it("refuses one id for two constraints, and two options under one id", () => {
    const twice = edited((week) => {
      must(ticketOf(week, 1).figures[0]).id = "F1"
    })
    const sameOption = edited((week) => {
      optionOf(week, 0, 0, 2).id = "B"
    })
    expect(refused(twice)).toContain(
      'tickets[1] ("TB-102").figures[0] ("F1").id: "F1" names another constraint too; each id names one'
    )
    // Renaming C also leaves the academy's test of C with nothing to test.
    expect(refused(sameOption)).toEqual([
      `${TB101}.forks[0].options[2] ("B").id: option "B" is used twice in this fork`,
      `${TB101}.academy[2].tests[1]: fork 1 has no option "C"`,
    ])
  })

  it("refuses a model named two ways", () => {
    const value = edited((week) => {
      optionOf(week, 0, 1, 1).model = {
        id: "clone-is-cheap",
        name: "Clones cost nothing",
      }
    })
    expect(refused(value)).toEqual([
      `${TB101}.forks[1].options[1] ("B").model.name: model "clone-is-cheap" is named "A clone is cheap enough to ignore at this size" elsewhere in the week; one id, one name`,
    ])
  })

  it("refuses an exercise naming a fork, an option or a test the ticket doesn't have", () => {
    const noFork = edited((week) => {
      exerciseOf(week, 0, 0).forks = [1, 3]
    })
    const noOption = edited((week) => {
      exerciseOf(week, 0, 0).tests = [{ fork: 1, option: "D" }]
    })
    const unnamed = edited((week) => {
      exerciseOf(week, 0, 2).tests = [{ fork: 2, option: "A" }]
    })
    expect(refused(noFork)).toEqual([
      `${TB101}.academy[0].forks[1]: TB-101 has 2 forks; there is no fork 3`,
    ])
    expect(refused(noOption)).toEqual([
      `${TB101}.academy[0].tests[0]: fork 1 has no option "D"`,
    ])
    expect(refused(unnamed)).toEqual([
      `${TB101}.academy[2].tests[0]: it tests fork 2, so name fork 2 among the forks it builds toward`,
    ])
  })

  it("refuses an exercise naming no word, no fork or no test, and a ticket with no academy", () => {
    const value = edited((week) => {
      exerciseOf(week, 0, 0).keywords = []
      exerciseOf(week, 0, 1).forks = []
      exerciseOf(week, 0, 2).tests = []
      ticketOf(week, 1).academy = []
    })
    expect(refused(value)).toEqual([
      `${TB101}.academy[0].keywords: an exercise names at least one word it works on`,
      `${TB101}.academy[1].forks: an exercise builds toward at least one fork`,
      `${TB101}.academy[2].tests: an exercise tests at least one option's model`,
      'tickets[1] ("TB-102").academy: a ticket\'s academy has 1 to 8 exercises',
    ])
  })

  it("refuses a /2 ticket still written as /1", () => {
    const [first, second, third] = TALLOWBROOK_WEEK_FILE.tickets
    if (third === undefined) throw new Error("the /2 sample changed shape")
    const { forks, academy: _academy, ...rest } = third
    const asV1 = { ...rest, speakTo: forks.map((fork) => fork.question) }
    const value = { ...TALLOWBROOK_WEEK_FILE, tickets: [first, second, asV1] }
    expect(refused(value).sort()).toEqual([
      'tickets[2] ("TB-103").academy: Invalid input: expected array, received undefined',
      'tickets[2] ("TB-103").forks: Invalid input: expected array, received undefined',
      'tickets[2] ("TB-103"): Unrecognized key: "speakTo"',
    ])
  })
})
