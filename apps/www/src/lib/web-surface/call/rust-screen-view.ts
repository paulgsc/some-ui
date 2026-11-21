/**
 * What the Rust Rounds screen stage draws (RR31, #3288), decided without a
 * DOM: the week home handed the recorder, read through the phone's own door
 * (`heldFromHome`), and the ticket asked for; or the sample week, for a
 * viewer or with no week named; or why nothing can be drawn.
 */
import type { HeldWeek, Ticket } from "@some-ui/rust-rounds"
import { heldFromHome, TALLOWBROOK_HELD } from "@some-ui/rust-rounds"

export type ScreenState =
  | { readonly kind: "waiting" }
  | { readonly kind: "none"; readonly problems: ReadonlyArray<string> }
  | {
      readonly kind: "screen"
      readonly held: HeldWeek
      readonly ticket: Ticket
      /** Whether it is the sample rather than the week home handed over. */
      readonly sample: boolean
    }

export function screenStageOf({
  week,
  ticket,
  viewer,
  read,
}: {
  /** The week by its id, or "sample"; the sample when absent. */
  readonly week: string | undefined
  /** The ticket by its key; the week's first when absent. */
  readonly ticket: string | undefined
  /** A viewer of the Pages build is always shown the sample. */
  readonly viewer: boolean
  readonly read: {
    readonly data: unknown
    readonly pending: boolean
    readonly failed: boolean
  }
}): ScreenState {
  const sample = viewer || week === undefined || week === "sample"
  let held: HeldWeek | null = TALLOWBROOK_HELD
  if (!sample) {
    if (read.failed) return none(`there is no week of ${week}`)
    if (read.pending) return { kind: "waiting" }
    held = heldFromHome(read.data)
    if (held === null) return none(`the week of ${week} can't be read`)
    if (held.week.id !== week)
      return none(`the file holds the week of ${held.week.id}, not ${week}`)
  }
  const found =
    ticket === undefined
      ? held.week.tickets[0]
      : held.week.tickets.find((each) => each.id === ticket)
  if (found === undefined)
    return none(`the week of ${held.week.id} has no ticket ${ticket ?? ""}`)
  return { kind: "screen", held, ticket: found, sample }
}

const none = (problem: string): ScreenState => ({
  kind: "none",
  problems: [problem],
})
