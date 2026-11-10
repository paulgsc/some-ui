/**
 * A week of Rust Rounds on the phone (RR13, paulgsc/some-ui#2688): the brief
 * (the company, its story, what it has to meet, the tickets and where each
 * stands), each ticket's card (its spec, its speak-to points, the program
 * and rustc's recorded result, and one take), swiped between, then every
 * take looked over and sent home together; once sent, each ticket with its
 * take and the words home heard in it. Until the deadline the week stays
 * open after a send, to answer, say again and send again (RR22); after it,
 * the week reads back what was sent, and nothing records or sends. Nothing
 * answers on any of them.
 *
 * It renders `lib/week-play`'s state and forwards taps; the cards and the
 * look over are the shared bundle's parts (`@some-ui/shared`'s `BundleCards`
 * and `BundleReview`, swiped with `usePager`), and every word is
 * `lib/week-play/words`'. It owns one runtime for as long as it is mounted
 * (docs/monorepo-boundaries.md, "Inside a React package").
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useId, useState, useSyncExternalStore } from "react"
import { RunView } from "@rust-rounds/components/rustc-run"
import type { Ticket, Week } from "@rust-rounds/lib/formats/week"
import type { PasteRuntime } from "@rust-rounds/lib/week-play/paste"
import { PASTE_MAX, pasteLine } from "@rust-rounds/lib/week-play/paste"
import type {
  RustWeekPorts,
  WeekHeard,
} from "@rust-rounds/lib/week-play/runtime"
import { createRustWeek } from "@rust-rounds/lib/week-play/runtime"
import type {
  WeekAtHome,
  WeekKind,
  WeekState,
} from "@rust-rounds/lib/week-play/spec"
import { isClosed, ticketLine } from "@rust-rounds/lib/week-play/spec"
import type { TicketStanding } from "@rust-rounds/lib/week-play/words"
import { WEEK_WORDS } from "@rust-rounds/lib/week-play/words"
import type { HeldWeek } from "@rust-rounds/lib/weeks"
import { assertNever } from "@some-ui/core-utils"
import {
  BundleCards,
  bundleConfirm,
  BundleReview,
  Button,
  CodeCard,
  ConfirmSheet,
  Notice,
  TakeItem,
  TakeRow,
  Textarea,
  useConfirmSheet,
  useTakePattern,
} from "@some-ui/shared"
import type {
  BundleIntent,
  BundleMachine,
  BundleTakes,
  TakeItemView,
  TakePatternSnapshot,
  TakeRowView,
} from "@some-ui/voice-capture"
import { takeItemView } from "@some-ui/voice-capture"
import { ChevronLeft } from "lucide-react"

const WORDS = WEEK_WORDS

export type RustWeekProps = {
  /** The phone's ports. Read once, on mount. */
  ports: RustWeekPorts
  /** The way back to Practice, on the brief and once sent. */
  back?: ReactNode
  /** Opens the rounds from before, until RR20 retires them. */
  onRounds?: () => void
}

type Dispatch = (intent: BundleIntent<WeekKind>) => void

type Parts = {
  readonly machine: BundleMachine<WeekKind>
  readonly state: WeekState
  readonly takes: BundleTakes
  readonly snapshot: TakePatternSnapshot
  readonly dispatch: Dispatch
}

/** The take the last send holds for `ticket`, if it holds one. */
const sentTake = (state: WeekState, ticket: string): string | null =>
  state.sent?.answers.find((each) => each.ticket === ticket)?.take ?? null

/**
 * Where a ticket stands: on this phone, sent home, said again since, or,
 * once the week closed, left unanswered.
 */
function standing(
  { machine, state }: Pick<Parts, "machine" | "state">,
  ticket: string,
  closed: boolean
): TicketStanding {
  const home = sentTake(state, ticket)
  if (closed) return home === null ? "unanswered" : "sent"
  const now = machine.answered(state, ticket)
  if (home === null) return now === null ? "open" : "said"
  const current = state.takes.find(
    (take) =>
      take.answers === machine.answersOf(state, ticket) &&
      take.standing === "current"
  )
  return current === undefined || current.id === home ? "sent" : "resaid"
}

/** What the ticket's program did, as the brief says it in a word. */
const shape = (held: HeldWeek, ticket: Ticket): string | null => {
  const run = held.runs[ticket.id]
  if (run === undefined) return null
  return run.outcome === "compile-error" ? WORDS.doesntCompile : WORDS.compiles
}

const Story = ({ week }: { week: Week }): JSX.Element => (
  <>
    <header className="space-y-1">
      <p className="text-muted-foreground text-xs font-semibold">
        {WORDS.heading(week)}
      </p>
      <h2 className="text-3xl font-extrabold">{week.company.name}</h2>
      <p className="text-muted-foreground">{week.company.about}</p>
    </header>
    <p className="bg-card rounded-2xl p-3 italic">{week.story}</p>
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{WORDS.sla}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {week.sla.map(({ what, target }) => (
          <div key={what} className="contents">
            <dt className="text-muted-foreground">{what}</dt>
            <dd>{target}</dd>
          </div>
        ))}
      </dl>
    </section>
  </>
)

const Brief = (
  props: Parts & {
    held: HeldWeek
    back: ReactNode
    onRounds?: () => void
    paste: PasteRuntime
    atHome: WeekAtHome
  }
): JSX.Element => {
  const { machine, state, dispatch, held } = props
  const { week } = held
  const said = machine.answeredCount(state)
  const { holds, last } = props.atHome
  const of = week.tickets.length
  return (
    <div className="flex flex-col gap-4">
      <Story week={week} />
      {last !== null && (
        <section className="bg-card flex flex-col gap-1 rounded-2xl p-3 text-sm">
          <p className="font-semibold">
            {holds?.at === last.at
              ? WORDS.held(last.answers.length, of, last.at)
              : WORDS.goesHome(last.answers.length, of, last.at)}
          </p>
          <p className="text-muted-foreground">{WORDS.openUntil(week)}</p>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{WORDS.tickets}</h3>
        {week.tickets.map((ticket, i) => (
          <Button
            key={ticket.id}
            variant="outline"
            className="h-auto flex-col items-start gap-0.5 rounded-2xl p-3 text-left whitespace-normal"
            onClick={() => dispatch({ type: "go", index: i })}
          >
            <span className="font-semibold">
              {WORDS.ticketLabel(ticket.id, ticket.title)}
            </span>
            <span className="text-muted-foreground text-xs font-normal">
              {[
                WORDS.standing[standing(props, ticket.id, false)],
                shape(held, ticket),
                WORDS.speakToCount(ticket.speakTo.length),
              ]
                .filter((part) => part !== null)
                .join(" · ")}
            </span>
          </Button>
        ))}
      </section>
      <Button
        size="lg"
        variant={said > 0 ? "default" : "outline"}
        onClick={() => dispatch({ type: "review" })}
      >
        {WORDS.toReviewOf(said, week.tickets.length)}
      </Button>
      <Button variant="outline" onClick={() => props.paste.open()}>
        {WORDS.paste.open}
      </Button>
      {props.back}
      {props.onRounds !== undefined && (
        <Button variant="link" size="sm" onClick={props.onRounds}>
          {WORDS.rounds}
        </Button>
      )}
    </div>
  )
}

/** What home heard in a take sent, or why it doesn't show yet. */
const HeardLine = ({ words }: { words: WeekHeard[string] }): JSX.Element =>
  words?.kind === "heard" ? (
    <blockquote className="bg-card rounded-2xl p-3 text-sm">
      <span className="text-muted-foreground block text-xs font-semibold">
        {WORDS.sent.heard}
      </span>
      {words.text === "" ? WORDS.sent.noWords : words.text}
    </blockquote>
  ) : (
    <p className="text-muted-foreground text-sm">
      {words?.kind === "notYet" ? WORDS.sent.hearing : WORDS.sent.later}
    </p>
  )

/** A ticket's card above its take: what it asks, what rustc did, what home holds. */
const TicketHead = ({
  held,
  ticket,
  n,
  state,
  heard,
}: {
  held: HeldWeek
  ticket: Ticket
  n: number
  state: WeekState
  heard: WeekHeard
}): JSX.Element => {
  const home = sentTake(state, ticket.id)
  const current = state.takes.find(
    (take) =>
      take.answers === ticketLine(state.draft.id, ticket.id) &&
      take.standing === "current"
  )
  return (
    <>
      <TicketBody held={held} ticket={ticket} n={n} />
      {home !== null && (
        <section className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            {current === undefined || current.id === home
              ? WORDS.home.holds
              : WORDS.home.again}
          </p>
          <HeardLine words={heard[home]} />
        </section>
      )}
      <h3 className="text-lg font-bold">{WORDS.guideOn(ticket.id)}</h3>
    </>
  )
}

/** What a ticket asks, and what rustc did with its program. */
const TicketBody = ({
  held,
  ticket,
  n,
}: {
  held: HeldWeek
  ticket: Ticket
  n: number
}): JSX.Element => {
  const run = held.runs[ticket.id] ?? null
  const span =
    run?.outcome === "compile-error" && run.span !== null
      ? [run.span]
      : undefined
  return (
    <>
      <p className="text-muted-foreground text-xs font-semibold">
        {WORDS.ticketOf(ticket.id, n, held.week.tickets.length)}
      </p>
      <h2 className="text-2xl font-extrabold text-balance">{ticket.title}</h2>
      <p>{ticket.spec}</p>
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">{WORDS.speakTo}</h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {ticket.speakTo.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ol>
      </section>
      <CodeCard
        code={ticket.program}
        label={ticket.id}
        spans={span}
        appearance="code"
      />
      <RunView
        run={run}
        none={held.ended.includes(ticket.id) ? WORDS.noRun : WORDS.noRunYet}
        silent={WORDS.rustcSilent}
      />
      {ticket.figures.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-muted-foreground text-xs font-semibold">
            {WORDS.figures}
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {ticket.figures.map((figure) => (
              <li key={figure}>{figure}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

const Review = (props: Parts & { held: HeldWeek }): JSX.Element => {
  const { machine, state, held } = props
  const needs = machine.missing(state)
  // What the send would hold, tickets home holds from the last one included.
  const n = machine.bundleRecord(state, state.at).answers.length
  const notNear = state.reach === "near" ? null : WORDS.notNear[state.reach]
  const label = (id: string): string =>
    WORDS.ticketLabel(
      id,
      held.week.tickets.find((each) => each.id === id)?.title ?? ""
    )
  return (
    <BundleReview
      {...props}
      words={WORDS}
      header={
        <p className="text-muted-foreground text-sm">{WORDS.review.kept}</p>
      }
      label={label}
      notSaid={() => WORDS.review.notSaid}
      beforeSend={
        notNear !== null && (
          <p className="text-muted-foreground text-center text-sm">{notNear}</p>
        )
      }
      send={state.sent === null ? WORDS.send(n) : WORDS.sendAgain(n)}
      needs={needs === null || needs === "required" ? null : WORDS.needs[needs]}
    />
  )
}

/** The row of the take `take`, current or superseded since, if this phone lists it. */
const sentRow = (
  view: TakeItemView,
  take: string | null
): TakeRowView | undefined =>
  [...view.current, ...view.earlier].find((row) => row.take.id === take)

/**
 * The week read back once it closed (RR22): the brief, then every ticket
 * with what it asked and the take sent by the deadline, playable, or "Not
 * answered.". Nothing here records, deletes or sends.
 */
const ReadBack = (
  props: Parts & {
    held: HeldWeek
    heard: WeekHeard
    back: ReactNode
    atHome: WeekAtHome
  }
): JSX.Element => {
  const { machine, state, snapshot, takes, dispatch, held, heard } = props
  const { week } = held
  const { holds, last } = props.atHome
  // What counts is what home had at the deadline (C56).
  const answered = holds?.answers ?? []
  return (
    <div className="flex flex-col gap-4">
      <Story week={week} />
      <section className="bg-card flex flex-col gap-1 rounded-2xl p-3 text-sm">
        <p className="font-semibold">{WORDS.closed.title(week)}</p>
        <p className="text-muted-foreground">{WORDS.closed.line(week)}</p>
        <p>{WORDS.closed.sentOf(answered.length, week.tickets.length)}</p>
        {last !== null && last.at !== holds?.at && (
          <p className="text-muted-foreground">{WORDS.closed.late(last.at)}</p>
        )}
      </section>
      <ol className="flex flex-col gap-6">
        {week.tickets.map((ticket, i) => {
          const answer = answered.find((each) => each.ticket === ticket.id)
          const row = sentRow(
            takeItemView(
              snapshot,
              state.takes,
              machine.answersOf(state, ticket.id),
              takes.pattern.options
            ),
            answer?.take ?? null
          )
          return (
            <li key={ticket.id} className="flex flex-col gap-3">
              <TicketBody held={held} ticket={ticket} n={i + 1} />
              {answer === undefined ? (
                <p className="text-muted-foreground text-sm">
                  {WORDS.closed.notAnswered}
                </p>
              ) : (
                <>
                  {row === undefined ? (
                    <p className="text-muted-foreground text-sm">
                      {WORDS.closed.unplayable}
                    </p>
                  ) : (
                    <TakeRow
                      row={{ ...row, canRedo: false, canLetGo: false }}
                      onPlay={() =>
                        dispatch({ type: "play", take: row.take.id })
                      }
                    />
                  )}
                  <HeardLine words={heard[answer.take]} />
                </>
              )}
            </li>
          )
        })}
      </ol>
      {props.back}
    </div>
  )
}

/** The week sent: each ticket with its take, and the words home heard. */
const Sent = (
  props: Parts & {
    held: HeldWeek
    heard: WeekHeard
    back: ReactNode
  }
): JSX.Element => {
  const { machine, state, snapshot, takes, dispatch, held, heard } = props
  const { sent } = state
  const answered = sent?.answers ?? []
  return (
    <div className="flex flex-col gap-4">
      <h2 aria-live="polite" className="text-3xl font-extrabold">
        {WORDS.sent.title(answered.length, held.week.tickets.length)}
      </h2>
      <p className="text-muted-foreground">{WORDS.sent.line}</p>
      <p className="text-muted-foreground">{WORDS.sent.again(held.week)}</p>
      <Button size="lg" onClick={() => dispatch({ type: "back" })}>
        {WORDS.backToWeek}
      </Button>
      <ol className="flex flex-col gap-3">
        {held.week.tickets.map((ticket) => {
          const answer = answered.find((each) => each.ticket === ticket.id)
          const row = sentRow(
            takeItemView(
              snapshot,
              state.takes,
              machine.answersOf(state, ticket.id),
              takes.pattern.options
            ),
            answer?.take ?? null
          )
          const words = answer === undefined ? undefined : heard[answer.take]
          return (
            <li key={ticket.id} className="flex flex-col gap-2">
              <p className="text-sm font-semibold">
                {WORDS.ticketLabel(ticket.id, ticket.title)}
              </p>
              {answer === undefined ? (
                <p className="text-muted-foreground text-sm">
                  {WORDS.sent.notAnswered}
                </p>
              ) : (
                <>
                  {row !== undefined && (
                    <TakeRow
                      row={row}
                      onPlay={() =>
                        dispatch({ type: "play", take: row.take.id })
                      }
                    />
                  )}
                  <HeardLine words={words} />
                </>
              )}
            </li>
          )
        })}
      </ol>
      {props.back}
    </div>
  )
}

/** An error from your own code, pasted as rustc printed it, and a note on it. */
const Paste = ({
  paste,
  state,
  takes,
  snapshot,
}: Pick<Parts, "state" | "takes" | "snapshot"> & {
  paste: PasteRuntime
}): JSX.Element | null => {
  const id = useId()
  const confirm = useConfirmSheet()
  const { draft } = useSyncExternalStore(paste.subscribe, paste.getSnapshot)
  if (draft === null) return null
  const line = pasteLine(draft.week, draft.at)
  const view = takeItemView(snapshot, state.takes, line, takes.pattern.options)
  const recording = snapshot.take.kind !== "idle"
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h2 className="text-2xl font-extrabold">{WORDS.paste.heading}</h2>
        <p className="text-muted-foreground">{WORDS.paste.line}</p>
      </header>
      <label htmlFor={id} className="text-sm font-semibold">
        {WORDS.paste.label}
      </label>
      <Textarea
        id={id}
        value={draft.text}
        rows={8}
        maxLength={PASTE_MAX}
        className="font-mono text-xs"
        onChange={(event) =>
          paste.dispatch({ type: "text", text: event.currentTarget.value })
        }
      />
      <p className="text-muted-foreground text-xs">
        {WORDS.paste.left(PASTE_MAX - draft.text.length)}
      </p>
      <p className="text-sm">{WORDS.paste.say}</p>
      <TakeItem
        view={view}
        onTap={() => paste.tap(snapshot)}
        onPlay={(take) => takes.pattern.play(take)}
        onRedo={() => paste.tap(snapshot)}
        onLetGo={() =>
          confirm.ask({
            title: WORDS.paste.deleteNote.title,
            description: WORDS.paste.deleteNote.line,
            confirm: WORDS.confirm.yes,
            keep: WORDS.confirm.keep,
            onConfirm: paste.deleteNote,
          })
        }
      />
      {confirm.sheet}
      <p className="text-muted-foreground text-sm">{WORDS.paste.where}</p>
      <Button
        size="lg"
        disabled={draft.text.trim() === "" || recording}
        onClick={() => paste.dispatch({ type: "keep" })}
      >
        {WORDS.paste.keep}
      </Button>
      <Button
        variant="outline"
        disabled={recording}
        onClick={() => paste.dispatch({ type: "close" })}
      >
        {WORDS.paste.back}
      </Button>
    </div>
  )
}

const Screen = (
  props: Parts & {
    held: HeldWeek
    heard: WeekHeard
    back: ReactNode
    onRounds?: () => void
    paste: PasteRuntime
    atHome: WeekAtHome
  }
): JSX.Element => {
  const { state, dispatch, held } = props
  // Past the deadline the week only reads back (RR22).
  if (
    state.screen !== "loading" &&
    state.screen !== "unreadable" &&
    isClosed(held.week, state.at)
  ) {
    return <ReadBack {...props} />
  }
  switch (state.screen) {
    case "loading": {
      return <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
    }
    case "unreadable": {
      return (
        <>
          <Notice
            tone="danger"
            action={{
              label: WORDS.readAgain,
              onClick: () => dispatch({ type: "readAgain" }),
            }}
          >
            {WORDS.unreadable}
          </Notice>
          {props.back}
        </>
      )
    }
    case "intro": {
      return <Brief {...props} />
    }
    case "cards": {
      return (
        <BundleCards
          {...props}
          words={WORDS}
          renderHead={(id, n) => {
            const ticket = held.week.tickets.find((each) => each.id === id)
            return ticket === undefined ? null : (
              <TicketHead
                held={held}
                ticket={ticket}
                n={n}
                state={state}
                heard={props.heard}
              />
            )
          }}
        />
      )
    }
    case "review": {
      return <Review {...props} />
    }
    case "sent": {
      return <Sent {...props} />
    }
    default: {
      return assertNever(state.screen)
    }
  }
}

export const RustWeek = ({
  ports,
  back,
  onRounds,
}: RustWeekProps): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime, and the week and takes it runs on, are made once per mount, as the idea bundle's are */
  const [{ week, desk, held }] = useState(() => ({
    week: createRustWeek(ports),
    desk: ports.takes,
    held: ports.week,
  }))
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => week.attach(), [week])
  const state = useSyncExternalStore(
    week.bundle.subscribe,
    week.bundle.getSnapshot
  )
  const heard = useSyncExternalStore(
    week.heard.subscribe,
    week.heard.getSnapshot
  )
  const atHome = useSyncExternalStore(
    week.atHome.subscribe,
    week.atHome.getSnapshot
  )
  const pasting = useSyncExternalStore(
    week.paste.subscribe,
    week.paste.getSnapshot
  )
  const snapshot = useTakePattern(desk.pattern)
  const { dispatch } = week.bundle
  const closed = isClosed(held.week, state.at)
  const backable =
    !closed && (state.screen === "cards" || state.screen === "review")
  const label = (id: string): string =>
    WORDS.ticketLabel(
      id,
      held.week.tickets.find((each) => each.id === id)?.title ?? ""
    )
  return (
    <div className="flex flex-col gap-4">
      {backable && (
        // Held while a take is under way (HS1).
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={state.busy}
          onClick={() => dispatch({ type: "back" })}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {WORDS.back}
        </Button>
      )}
      {pasting.showing && state.screen === "intro" && !closed ? (
        <Paste
          paste={week.paste}
          state={state}
          takes={desk}
          snapshot={snapshot}
        />
      ) : (
        <Screen
          machine={week.machine}
          state={state}
          takes={desk}
          snapshot={snapshot}
          dispatch={dispatch}
          held={held}
          heard={heard}
          atHome={atHome}
          back={back}
          paste={week.paste}
          {...(onRounds === undefined ? {} : { onRounds })}
        />
      )}
      {pasting.notice !== null && (
        <Notice
          key={pasting.notice}
          onDismiss={() => week.paste.dispatch({ type: "noticeDismissed" })}
        >
          {WORDS.paste[pasting.notice]}
        </Notice>
      )}
      <ConfirmSheet
        request={bundleConfirm(
          { machine: week.machine, state, dispatch, words: WORDS },
          label
        )}
        open={state.confirm !== null}
        onOpenChange={(open) => {
          if (!open && state.confirm !== null) dispatch({ type: "keepIt" })
        }}
      />
    </div>
  )
}
