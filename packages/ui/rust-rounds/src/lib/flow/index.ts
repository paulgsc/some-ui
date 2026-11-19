/**
 * A week's flow on the phone (RR25, paulgsc/some-ui#3249; RR29 #3257): each
 * ticket is read, then worked in its academy, then voiced, and any step may
 * be skipped. The owner approved this flow (C690).
 *
 * - **One line of steps** (`flowSteps`): every ticket's steps in the week's
 *   order, so one pager turns through them all (GES5). A ticket with no
 *   academy (a `/1` week's, upgraded) has no academy step.
 * - **A step's standing is its latest mark** (`stepStanding`): `done` or
 *   `skipped`, or `open` with none. Marks are appended, never written over
 *   (never lose the record), so a step skipped and later done says so in
 *   the order it happened.
 * - **Only what the week has.** A mark for a step the week doesn't have, or
 *   one that repeats the step's standing, changes nothing (`mark`).
 * - **Where to open** (`openAt`): the first step not done or skipped, or the
 *   last step once every one is.
 * - **One week's marks.** A ticket's id names it within its week only, so
 *   these read the marks of one week: `ofWeek(kept, week.id)`
 *   (`lib/week-play/store`), never every week's.
 */
import type { Week } from "@rust-rounds/lib/formats/week"
import { assertNever } from "@some-ui/core-utils"

/** A step of a ticket's flow. */
export type FlowStepKind = "read" | "academy" | "voice"

/** One place on the week's line of steps. */
export type FlowStep = { readonly ticket: string; readonly step: FlowStepKind }

/** What the owner did at a step: worked it through, or passed it by. */
export type MarkKind = "done" | "skipped"

/** One mark, as kept. */
export type StepMark = FlowStep & {
  readonly mark: MarkKind
  /** When, ISO. */
  readonly at: string
}

/** A step's standing now. */
export type Standing = MarkKind | "open"

type FlowTicket = Pick<Week["tickets"][number], "id" | "academy">

/** A ticket's steps, in the order they are worked. */
const stepsOf = (ticket: FlowTicket): ReadonlyArray<FlowStepKind> =>
  ticket.academy.length > 0 ? ["read", "academy", "voice"] : ["read", "voice"]

/** Every ticket's steps, in the week's order: the pager's line. */
export function flowSteps(week: {
  readonly tickets: ReadonlyArray<FlowTicket>
}): ReadonlyArray<FlowStep> {
  return week.tickets.flatMap((ticket) =>
    stepsOf(ticket).map((step) => ({ ticket: ticket.id, step }))
  )
}

const sameStep = (a: FlowStep, b: FlowStep): boolean =>
  a.ticket === b.ticket && a.step === b.step

/** The latest mark at `at`'s step, as its standing. */
export function stepStanding(
  marks: ReadonlyArray<StepMark>,
  at: FlowStep
): Standing {
  let standing: Standing = "open"
  for (const each of marks) {
    if (sameStep(each, at)) standing = each.mark
  }
  return standing
}

/**
 * `marks` with `made` appended, or `marks` itself when it changes nothing:
 * a step the week doesn't have, or the standing it already has.
 */
export function mark(
  steps: ReadonlyArray<FlowStep>,
  marks: ReadonlyArray<StepMark>,
  made: StepMark
): ReadonlyArray<StepMark> {
  if (!steps.some((each) => sameStep(each, made))) return marks
  if (stepStanding(marks, made) === made.mark) return marks
  return [...marks, made]
}

/**
 * Where the week opens on its line: the first step still open, or the last
 * step when none is. Null for a week with no steps.
 */
export function openAt(
  steps: ReadonlyArray<FlowStep>,
  marks: ReadonlyArray<StepMark>
): number | null {
  if (steps.length === 0) return null
  const open = steps.findIndex((each) => stepStanding(marks, each) === "open")
  return open === -1 ? steps.length - 1 : open
}

/**
 * An exercise of a ticket's academy the owner says they worked at their
 * desk (C673: the owner's tick; nothing checks it). Kept, never taken back.
 */
export type ExerciseTick = {
  readonly ticket: string
  /** The exercise, from 1, in its ticket's academy. */
  readonly exercise: number
  /** When, ISO. */
  readonly at: string
}

/** The exercises of `ticket` ticked, by number from 1. */
export function ticked(
  ticks: ReadonlyArray<ExerciseTick>,
  ticket: string
): ReadonlySet<number> {
  return new Set(
    ticks.filter((each) => each.ticket === ticket).map((each) => each.exercise)
  )
}

/**
 * `ticks` with `made` appended, or `ticks` itself when it changes nothing:
 * an exercise the week's ticket doesn't have, or one ticked already.
 */
export function tick(
  week: { readonly tickets: ReadonlyArray<FlowTicket> },
  ticks: ReadonlyArray<ExerciseTick>,
  made: ExerciseTick
): ReadonlyArray<ExerciseTick> {
  const ticket = week.tickets.find((each) => each.id === made.ticket)
  if (ticket === undefined) return ticks
  if (made.exercise < 1 || made.exercise > ticket.academy.length) return ticks
  if (ticked(ticks, made.ticket).has(made.exercise)) return ticks
  return [...ticks, made]
}

/** Where on the line `ticket` opens: its first step still open, else its first. */
export function openFor(
  steps: ReadonlyArray<FlowStep>,
  marks: ReadonlyArray<StepMark>,
  ticket: string
): number | null {
  const mine = steps.flatMap((each, i) => (each.ticket === ticket ? [i] : []))
  const open = mine.find((i) => {
    const step = steps[i]
    return step !== undefined && stepStanding(marks, step) === "open"
  })
  return open ?? mine[0] ?? null
}

/** How the owner leaves a step: on to the next, or straight to the ticket's voice. */
export type Leave = "onward" | "toVoice"

/** What the owner did on a ticket, which leaving its step marks. */
export type Worked = {
  /** Exercises of the ticket's academy ticked. */
  readonly ticked: number
  /** Whether a take is said at any of the ticket's forks. */
  readonly said: boolean
}

/**
 * Leaving step `from` of the line (C710): each step left forward is marked,
 * and the line moves on.
 *
 * - **Read**, onward: read is done, on to the next step. `toVoice` passes
 *   the academy by too (skipped), straight to the ticket's voice, unless it
 *   was worked (an exercise ticked) or marked already.
 * - **Academy**: done with any exercise ticked, else skipped; on to voice.
 * - **Voice**: done with any take said, else skipped; on to where the next
 *   ticket opens, or nowhere after the last.
 *
 * A swipe or a tap on a step moves without marking anything: only these
 * buttons say what was done. Marks go through `mark`, so one repeating a
 * standing adds nothing.
 */
export function leave(
  steps: ReadonlyArray<FlowStep>,
  marks: ReadonlyArray<StepMark>,
  from: number,
  how: Leave,
  worked: Worked,
  at: string
): { readonly marks: ReadonlyArray<StepMark>; readonly to: number } {
  const step = steps[from]
  if (step === undefined) return { marks, to: from }
  const put = (
    kept: ReadonlyArray<StepMark>,
    kind: FlowStepKind,
    made: MarkKind
  ): ReadonlyArray<StepMark> =>
    mark(steps, kept, { ticket: step.ticket, step: kind, mark: made, at })
  const voice = steps.findIndex(
    (each) => each.ticket === step.ticket && each.step === "voice"
  )
  switch (step.step) {
    case "read": {
      const read = put(marks, "read", "done")
      if (how === "toVoice" && voice !== -1) {
        // An academy already worked, or marked, keeps what it has.
        const academy = { ticket: step.ticket, step: "academy" as const }
        const untouched =
          worked.ticked === 0 && stepStanding(read, academy) === "open"
        return {
          marks: untouched ? put(read, "academy", "skipped") : read,
          to: voice,
        }
      }
      return { marks: read, to: Math.min(from + 1, steps.length - 1) }
    }
    case "academy": {
      const made = worked.ticked > 0 ? "done" : "skipped"
      return {
        marks: put(marks, "academy", made),
        to: voice === -1 ? from : voice,
      }
    }
    case "voice": {
      const kept = put(marks, "voice", worked.said ? "done" : "skipped")
      const next = steps
        .slice(from + 1)
        .find((each) => each.ticket !== step.ticket)
      const to = next === undefined ? null : openFor(steps, kept, next.ticket)
      return { marks: kept, to: to ?? from }
    }
    default: {
      return assertNever(step.step)
    }
  }
}
