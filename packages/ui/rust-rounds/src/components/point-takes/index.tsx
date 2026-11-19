/**
 * One ticket's speak-to points, a take for each (RR24, #3248; the owner's
 * approval of the prototype, C680): the point being answered is open, with
 * its take button and takes (the shared bundle's `BundleTake`); every other
 * point is one quiet line, its number, the start of its words and whether
 * it's said, opened by a tap. Past `FILTER_FROM` points a quiet row of chips
 * (`Chip`) shows all, the unsaid or the said, in the order asked or the
 * unsaid first. While a take records, the point is all there is: the chips
 * and the other points recede to one line until it stops.
 *
 * A take of the whole ticket, recorded before takes went point by point, is
 * shown above the points, kept and counted for every point it answers.
 *
 * Self-contained, so a flow can host it (RR25's Voice step): it reads the
 * week's bundle and dispatches to it, takes a `heading`, what goes `before`
 * the points, what goes at the head of the open point (`pointHead`) and a
 * folded point's line (`pointSummary`) (all recede while a take records), and
 * `pointRecording` says when a host should recede too. Keyed by its ticket
 * where it is hosted, so a filter picked on one ticket isn't another's.
 */
import type { JSX, ReactNode } from "react"
import { useState } from "react"
import type { Ticket } from "@rust-rounds/lib/formats/week"
import type { PointFilter, PointOrder } from "@rust-rounds/lib/week-play/points"
import {
  FILTER_FROM,
  itemOf,
  pointCounts,
  pointItem,
  pointsShown,
  ticketPoints,
} from "@rust-rounds/lib/week-play/points"
import type { WeekKind, WeekState } from "@rust-rounds/lib/week-play/spec"
import { WEEK_WORDS } from "@rust-rounds/lib/week-play/words"
import { cn } from "@some-ui/core-utils"
import { BundleTake, Chip, CHIP_BAR, TakeRow } from "@some-ui/shared"
import type {
  BundleIntent,
  BundleMachine,
  BundleTakes,
  TakePatternSnapshot,
} from "@some-ui/voice-capture"
import { takeItemView } from "@some-ui/voice-capture"

const WORDS = WEEK_WORDS

export type PointTakesProps = {
  readonly machine: BundleMachine<WeekKind>
  readonly state: WeekState
  readonly takes: BundleTakes
  readonly snapshot: TakePatternSnapshot
  readonly dispatch: (intent: BundleIntent<WeekKind>) => void
  readonly ticket: Ticket
  /**
   * The card's heading; the points' own words when left out. A flow that
   * reads the points as something else (RR29's justification, RR25) says so.
   */
  readonly heading?: string
  /**
   * What a host shows above the points (RR25's verdict pick): it recedes
   * with them while a take records.
   */
  readonly before?: ReactNode
  /**
   * What a host shows inside the open point, above its take (RR25's pick of
   * that point's options); it recedes while a take records.
   */
  readonly pointHead?: (n: number) => ReactNode
  /** A folded point's one-line state, when the host says more than said or not. */
  readonly pointSummary?: (n: number) => string | null
}

/** Whether a take is recording or being kept: the card is all there is, and a host recedes too. */
export const pointRecording = (state: WeekState): boolean => state.busy

/** The point open on `ticket`'s card: the one the bundle is on, else the first unsaid. */
function openPoint(
  machine: BundleMachine<WeekKind>,
  state: WeekState,
  ticket: Ticket
): number {
  const on = itemOf(machine.spec.items[state.index] ?? "")
  if (on.ticket === ticket.id && on.point !== null) return on.point
  const unsaid = ticket.forks.findIndex(
    (_, i) => machine.answered(state, pointItem(ticket.id, i + 1)) === null
  )
  return unsaid === -1 ? 1 : unsaid + 1
}

export const PointTakes = (props: PointTakesProps): JSX.Element => {
  const { machine, state, takes, snapshot, dispatch, ticket, before } = props
  const [filter, setFilter] = useState<PointFilter>("all")
  const [order, setOrder] = useState<PointOrder>("asked")
  const open = openPoint(machine, state, ticket)
  const recording = pointRecording(state)
  const whole = machine.answered(state, ticket.id) === "said"
  // A take of the whole ticket answers every point it has (RR24): each is
  // counted and listed as answered, and says it is in the whole take.
  const own = (n: number): boolean =>
    machine.answered(state, pointItem(ticket.id, n)) === "said"
  const points = ticketPoints(
    ticket.forks.map((fork) => fork.question),
    own,
    whole
  )
  const go = (n: number): void => {
    const index = machine.spec.items.indexOf(pointItem(ticket.id, n))
    if (index !== -1) dispatch({ type: "go", index })
  }
  const openTake = (
    <BundleTake
      machine={machine}
      state={state}
      takes={takes}
      snapshot={snapshot}
      dispatch={dispatch}
      words={WORDS}
      item={pointItem(ticket.id, open)}
      head={null}
    />
  )

  if (recording) {
    return (
      <section data-point-takes="recording" className="flex flex-col gap-4">
        <p className="text-muted-foreground text-xs">
          {WORDS.points.pointOf(open, points.length)}
        </p>
        <p className="text-xl font-bold [overflow-wrap:anywhere]">
          {ticket.forks[open - 1]?.question}
        </p>
        {openTake}
        <p className="text-muted-foreground border-border flex justify-between gap-2 border-t pt-2 text-xs">
          <span>{WORDS.points.others(points.length - 1)}</span>
          <span>{WORDS.points.opensAgain}</span>
        </p>
      </section>
    )
  }

  const counts = pointCounts(points)
  const shown = pointsShown(points, filter, order, open)
  return (
    <section data-point-takes="" className="flex flex-col gap-3">
      {before}
      <h3 className="text-sm font-semibold">
        {props.heading ?? WORDS.points.heading}
      </h3>
      {whole && (
        <div className="border-border flex flex-col gap-2 rounded-2xl border border-dashed p-2">
          <p className="text-muted-foreground text-xs font-semibold">
            {WORDS.points.whole}
          </p>
          {takeItemView(
            snapshot,
            state.takes,
            machine.answersOf(state, ticket.id),
            takes.pattern.options
          ).current.map((row) => (
            <TakeRow
              key={row.take.id}
              row={{ ...row, canRedo: false }}
              onPlay={() => dispatch({ type: "play", take: row.take.id })}
              onLetGo={() => dispatch({ type: "askDelete", item: ticket.id })}
            >
              {WORDS.points.wholeLine}
            </TakeRow>
          ))}
        </div>
      )}
      {points.length >= FILTER_FROM && (
        <nav aria-label={WORDS.points.filter} className={CHIP_BAR}>
          {(
            [
              ["all", WORDS.points.all],
              ["none", WORDS.points.unsaid],
              ["taken", WORDS.points.said],
            ] as const
          ).map(([each, words]) => (
            <Chip
              key={each}
              picked={filter === each}
              count={counts[each]}
              onTap={() => setFilter(each)}
            >
              {words}
            </Chip>
          ))}
          <button
            type="button"
            className="text-muted-foreground ml-auto h-9 shrink-0 px-1 text-sm"
            onClick={() => setOrder(order === "asked" ? "none-first" : "asked")}
          >
            {order === "asked" ? WORDS.points.asked : WORDS.points.unsaidFirst}
          </button>
        </nav>
      )}
      <ol className="flex flex-col">
        {shown.map((point) =>
          point.n === open ? (
            <li
              key={point.n}
              data-point={point.n}
              className="border-border flex flex-col gap-3 border-t pt-3 pb-1"
            >
              <p className="grid grid-cols-[2ch_1fr] items-baseline gap-x-2.5 font-semibold [overflow-wrap:anywhere]">
                <span className="text-muted-foreground font-extrabold">
                  {point.n}
                </span>
                {point.to}
              </p>
              {props.pointHead?.(point.n)}
              {openTake}
            </li>
          ) : (
            <li key={point.n} data-point={point.n}>
              <button
                type="button"
                aria-label={WORDS.points.open(point.n, point.to)}
                onClick={() => go(point.n)}
                className="border-border grid min-h-11 w-full grid-cols-[2ch_1fr_auto] items-center gap-x-2.5 border-t py-2 text-left"
              >
                <span className="text-muted-foreground font-extrabold">
                  {point.n}
                </span>
                <span className="truncate text-sm">{point.to}</span>
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 rounded-full border-2",
                      point.taken
                        ? "bg-brand border-brand"
                        : "border-muted-foreground/60"
                    )}
                  />
                  {props.pointSummary?.(point.n) ??
                    (own(point.n)
                      ? WORDS.points.said
                      : whole
                        ? WORDS.points.inWhole
                        : WORDS.points.notSaid)}
                </span>
              </button>
            </li>
          )
        )}
      </ol>
      <p className="text-muted-foreground text-xs">
        {WORDS.points.count(counts.taken, counts.all)}
      </p>
    </section>
  )
}
