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
 */
import type { Week } from "@rust-rounds/lib/formats/week"

/** A step of a ticket's flow. */
type FlowStepKind = "read" | "academy" | "voice"

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
