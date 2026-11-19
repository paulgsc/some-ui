/**
 * The owner's decision at each fork of a week (RR29, paulgsc/some-ui#3257;
 * C693): a listed option, their own (said in the fork's take), or, for a
 * fork left alone, the recommended one by default.
 *
 * - **Every pick is kept** (never lose the record): a pick is appended, never
 *   written over, so the essay can see a decision the academy moved. The
 *   decision now is a fork's latest pick.
 * - **Left alone is said at send.** No pick is ever stored as "the
 *   recommended by default"; `atSend` names it for each fork with options
 *   and no pick, so a fork left alone stays apart from an explicit pick of
 *   the recommended option.
 * - **Only what the week offers.** A pick naming an option its fork doesn't
 *   list, or a fork the ticket doesn't have, changes nothing. A `/1` week's
 *   points are forks with no options: nothing to pick, nothing sent.
 * - **One week's picks.** Every function here reads the picks of the week
 *   it is given, and a ticket's id names it within its week only: give it
 *   `ofWeek(kept, week.id)` (`lib/week-play/store`), never every week's.
 */
import type { Week } from "@rust-rounds/lib/formats/week"

/** What the owner picks at a fork. */
export type Pick =
  | { readonly kind: "option"; readonly option: string }
  /** Their own decision: the fork's take says what it is. */
  | { readonly kind: "own" }

/** A fork's decision as it goes home with the week sent. */
type Decision = Pick | { readonly kind: "recommended-by-default" }

/** One pick, as kept. */
export type PickMade = {
  readonly ticket: string
  /** The fork, from 1. */
  readonly fork: number
  readonly pick: Pick
  /** When, ISO. */
  readonly at: string
}

const optionOf = (each: Pick): string | null =>
  each.kind === "option" ? each.option : null

const samePick = (a: Pick, b: Pick): boolean =>
  a.kind === b.kind && optionOf(a) === optionOf(b)

type Fork = Week["tickets"][number]["forks"][number]

/** The fork `fork` (from 1) of `ticket` in `week`, if it has one. */
const forkOf = (week: Week, ticket: string, fork: number): Fork | undefined =>
  week.tickets.find((each) => each.id === ticket)?.forks[fork - 1]

/** The latest pick at a fork, or null when none was made. */
export function currentPick(
  picks: ReadonlyArray<PickMade>,
  ticket: string,
  fork: number
): Pick | null {
  let latest: Pick | null = null
  for (const each of picks) {
    if (each.ticket === ticket && each.fork === fork) latest = each.pick
  }
  return latest
}

/**
 * `picks` with `made` appended, or `picks` itself when it changes nothing:
 * the same pick again, or one the week doesn't offer.
 */
export function pick(
  week: Week,
  picks: ReadonlyArray<PickMade>,
  made: PickMade
): ReadonlyArray<PickMade> {
  const fork = forkOf(week, made.ticket, made.fork)
  if (fork === undefined || fork.options.length === 0) return picks
  const option = optionOf(made.pick)
  if (option !== null && !fork.options.some((each) => each.id === option)) {
    return picks
  }
  const now = currentPick(picks, made.ticket, made.fork)
  if (now !== null && samePick(now, made.pick)) return picks
  return [...picks, made]
}

/** Each fork's decision as it goes home: by ticket, then by fork from 1. */
export type DecisionsSent = ReadonlyArray<{
  readonly ticket: string
  readonly forks: ReadonlyArray<{
    readonly fork: number
    readonly decision: Decision
  }>
}>

/** The decision at every fork with options, a fork left alone named so. */
export function atSend(
  week: Week,
  picks: ReadonlyArray<PickMade>
): DecisionsSent {
  return week.tickets
    .map((ticket) => ({
      ticket: ticket.id,
      forks: ticket.forks.flatMap((fork, i) => {
        if (fork.options.length === 0) return []
        const decision: Decision = currentPick(picks, ticket.id, i + 1) ?? {
          kind: "recommended-by-default",
        }
        return [{ fork: i + 1, decision }]
      }),
    }))
    .filter((ticket) => ticket.forks.length > 0)
}
