/**
 * The week's flow (RR25): its line of steps over both samples, and every
 * mark against every standing a step can have.
 */
import type { FlowStep, MarkKind, StepMark } from "@rust-rounds/lib/flow"
import { flowSteps, mark, openAt, stepStanding } from "@rust-rounds/lib/flow"
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
