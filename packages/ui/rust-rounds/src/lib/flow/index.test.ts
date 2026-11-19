/**
 * The week's flow (RR25): its line of steps over both samples, and every
 * mark against every standing a step can have.
 */
import type { FlowStep, MarkKind, StepMark } from "@rust-rounds/lib/flow"
import {
  flowSteps,
  leave,
  mark,
  openAt,
  openFor,
  stepStanding,
  tick,
  ticked,
} from "@rust-rounds/lib/flow"
import { QUILLMOSS_WEEK } from "@rust-rounds/lib/sample-week"
import { TALLOWBROOK_WEEK_FILE } from "@rust-rounds/lib/sample-week/tallowbrook"
import { describe, expect, it } from "vitest"

const AT = "2026-11-19T10:00:00Z"
const LATER = "2026-11-19T11:00:00Z"
const at = (step: FlowStep, kind: MarkKind, when = AT): StepMark => ({
  ...step,
  mark: kind,
  at: when,
})

describe("the line of steps", () => {
  it("reads, works the academy, then voices each ticket of a /2 week", () => {
    const steps = flowSteps(TALLOWBROOK_WEEK_FILE)
    expect(steps).toHaveLength(TALLOWBROOK_WEEK_FILE.tickets.length * 3)
    expect(steps.slice(0, 3)).toEqual([
      { ticket: "TB-101", step: "read" },
      { ticket: "TB-101", step: "academy" },
      { ticket: "TB-101", step: "voice" },
    ])
  })

  it("opens on the opening's questions, one step each, before the tickets (#3269)", () => {
    const steps = flowSteps(TALLOWBROOK_WEEK_FILE, 3)
    expect(steps.slice(0, 4)).toEqual([
      { ticket: "opening:1", step: "opening" },
      { ticket: "opening:2", step: "opening" },
      { ticket: "opening:3", step: "opening" },
      { ticket: "TB-101", step: "read" },
    ])
    // The week opens on the first question until it is left.
    expect(openAt(steps, [])).toBe(0)
  })

  it("has no academy step for a ticket with none, as a /1 week's", () => {
    const steps = flowSteps(QUILLMOSS_WEEK)
    expect(steps).toHaveLength(QUILLMOSS_WEEK.tickets.length * 2)
    expect(steps.some((each) => each.step === "academy")).toBe(false)
  })
})

describe("a mark, against every standing", () => {
  const steps = flowSteps(TALLOWBROOK_WEEK_FILE)
  const KINDS: ReadonlyArray<MarkKind> = ["done", "skipped"]
  const BEFORE: ReadonlyArray<ReadonlyArray<MarkKind>> = [
    [],
    ["done"],
    ["skipped"],
    ["skipped", "done"],
    ["done", "skipped"],
  ]

  for (const step of steps) {
    for (const prior of BEFORE) {
      for (const kind of KINDS) {
        it(`${step.ticket} ${step.step}: [${prior.join(", ")}] + ${kind}`, () => {
          const marks = prior.map((each) => at(step, each))
          const next = mark(steps, marks, at(step, kind, LATER))
          // Never drops or rewrites a mark kept.
          expect(next.slice(0, marks.length)).toEqual(marks)
          // The step now stands as marked.
          expect(stepStanding(next, step)).toBe(kind)
          // It grows only when the standing changes.
          const was = prior.at(-1) ?? "open"
          expect(next.length).toBe(marks.length + (was === kind ? 0 : 1))
          // No other step's standing moves.
          for (const other of steps) {
            if (other === step) continue
            expect(stepStanding(next, other)).toBe("open")
          }
        })
      }
    }
  }

  it("leaves a step the week doesn't have alone", () => {
    const missing = at({ ticket: "TB-999", step: "read" }, "done")
    expect(mark(steps, [], missing)).toEqual([])
    const noAcademy = flowSteps(QUILLMOSS_WEEK)
    const first = QUILLMOSS_WEEK.tickets[0]?.id ?? ""
    expect(
      mark(noAcademy, [], at({ ticket: first, step: "academy" }, "done"))
    ).toEqual([])
  })
})

describe("where the week opens", () => {
  const steps = flowSteps(TALLOWBROOK_WEEK_FILE)

  it("opens at the first step with no mark", () => {
    expect(openAt(steps, [])).toBe(0)
    const marks = steps
      .slice(0, 2)
      .map((each, i) => at(each, i === 0 ? "done" : "skipped"))
    expect(openAt(steps, marks)).toBe(2)
  })

  it("opens at the last step once every step is marked", () => {
    const marks = steps.map((each) => at(each, "done"))
    expect(openAt(steps, marks)).toBe(steps.length - 1)
  })

  it("has nowhere to open in a week with no steps", () => {
    expect(openAt([], [])).toBeNull()
  })
})

/**
 * Leaving a step by its own button (C710), from every step of a /2 ticket
 * and a /1 one, each way, with nothing and something worked.
 */
describe("leaving a step", () => {
  const steps = flowSteps(TALLOWBROOK_WEEK_FILE)
  const v1 = flowSteps(QUILLMOSS_WEEK)
  const none = { ticked: 0, said: false }
  const some = { ticked: 1, said: true }
  const kinds = (marks: ReadonlyArray<StepMark>): Array<string> =>
    marks.map((each) => `${each.ticket}:${each.step}:${each.mark}`)

  it("marks the read and moves on, or passes the academy by straight to voice", () => {
    expect(leave(steps, [], 0, "onward", none, AT)).toEqual({
      marks: [at({ ticket: "TB-101", step: "read" }, "done")],
      to: 1,
    })
    const skipped = leave(steps, [], 0, "toVoice", none, AT)
    expect(kinds(skipped.marks)).toEqual([
      "TB-101:read:done",
      "TB-101:academy:skipped",
    ])
    expect(skipped.to).toBe(2)
    // A /1 ticket has no academy to pass by: it goes on to its voice.
    const plain = leave(v1, [], 0, "toVoice", none, AT)
    expect(kinds(plain.marks)).toEqual([`${v1[0]?.ticket ?? ""}:read:done`])
    expect(plain.to).toBe(1)
  })

  it("leaves an academy worked or marked as it is when the read skips to voice", () => {
    const worked = leave(steps, [], 0, "toVoice", some, AT)
    expect(kinds(worked.marks)).toEqual(["TB-101:read:done"])
    expect(worked.to).toBe(2)
    const gone = [at({ ticket: "TB-101", step: "academy" }, "done")]
    expect(kinds(leave(steps, gone, 0, "toVoice", none, AT).marks)).toEqual([
      "TB-101:academy:done",
      "TB-101:read:done",
    ])
  })

  it("marks the academy by whether an exercise was ticked", () => {
    expect(kinds(leave(steps, [], 1, "onward", none, AT).marks)).toEqual([
      "TB-101:academy:skipped",
    ])
    const worked = leave(steps, [], 1, "onward", some, AT)
    expect(kinds(worked.marks)).toEqual(["TB-101:academy:done"])
    expect(worked.to).toBe(2)
  })

  it("marks the voice by whether a take was said, and opens the next ticket where it stands", () => {
    const earlier = [at({ ticket: "TB-102", step: "read" }, "done")]
    const left = leave(steps, earlier, 2, "onward", some, AT)
    expect(kinds(left.marks)).toEqual(["TB-102:read:done", "TB-101:voice:done"])
    expect(steps[left.to]).toEqual({ ticket: "TB-102", step: "academy" })
    expect(kinds(leave(steps, [], 2, "onward", none, AT).marks)).toEqual([
      "TB-101:voice:skipped",
    ])
    // After the last ticket's voice there is nowhere on: it stays.
    const last = steps.length - 1
    expect(leave(steps, [], last, "onward", none, AT).to).toBe(last)
  })

  it("marks a question of the opening by whether a take is in place, and moves on (#3269)", () => {
    const opened = flowSteps(TALLOWBROOK_WEEK_FILE, 2)
    const used = leave(opened, [], 0, "onward", some, AT)
    expect(kinds(used.marks)).toEqual(["opening:1:opening:done"])
    expect(used.to).toBe(1)
    const passed = leave(opened, [], 1, "onward", none, AT)
    expect(kinds(passed.marks)).toEqual(["opening:2:opening:skipped"])
    expect(opened[passed.to]).toEqual({ ticket: "TB-101", step: "read" })
  })

  it("adds nothing for a standing already held, or a step off the line", () => {
    const marks = [at({ ticket: "TB-101", step: "read" }, "done")]
    expect(leave(steps, marks, 0, "onward", none, AT).marks).toBe(marks)
    expect(leave(steps, marks, 99, "onward", none, AT)).toEqual({
      marks,
      to: 99,
    })
  })

  it("opens a ticket at its first open step, else its first", () => {
    expect(openFor(steps, [], "TB-102")).toBe(3)
    const all = steps
      .filter((each) => each.ticket === "TB-102")
      .map((each) => at(each, "done"))
    expect(openFor(steps, all.slice(0, 1), "TB-102")).toBe(4)
    expect(openFor(steps, all, "TB-102")).toBe(3)
    expect(openFor(steps, [], "XX-1")).toBeNull()
  })
})

describe("an exercise ticked (C673)", () => {
  const made = { ticket: "TB-101", exercise: 2, at: AT }

  it("keeps a tick once, and only for an exercise the ticket has", () => {
    const ticks = tick(TALLOWBROOK_WEEK_FILE, [], made)
    expect(ticks).toEqual([made])
    expect(tick(TALLOWBROOK_WEEK_FILE, ticks, { ...made, at: LATER })).toBe(
      ticks
    )
    for (const exercise of [0, 99]) {
      expect(tick(TALLOWBROOK_WEEK_FILE, [], { ...made, exercise })).toEqual([])
    }
    expect(
      tick(TALLOWBROOK_WEEK_FILE, [], { ...made, ticket: "XX-1" })
    ).toEqual([])
    // A /1 week's tickets have no academy to tick.
    const v1 = QUILLMOSS_WEEK.tickets[0]?.id ?? ""
    expect(
      tick(QUILLMOSS_WEEK, [], { ...made, ticket: v1, exercise: 1 })
    ).toEqual([])
    expect([...ticked(ticks, "TB-101")]).toEqual([2])
    expect(ticked(ticks, "TB-102").size).toBe(0)
  })
})
