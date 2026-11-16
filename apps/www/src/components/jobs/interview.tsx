/**
 * The interview week on the phone (IW5, paulgsc/some-ui#2936), in the Jobs
 * wing (C396): the brief (the invented company and role, the questions and
 * the reads, and where each stands), a card per question and per read,
 * swiped between, each with one spoken take of at most 2 minutes, then every
 * take looked over and sent home together. A read's card shows its script
 * large and scrollable; its take button counts down first (`lib/interview-week/cue`),
 * then records while the script stays on screen. Until the deadline the week
 * stays open after a send, to say again and send again; after it, the week
 * reads back what home had, and nothing records or sends. Nothing answers.
 *
 * It renders `lib/interview-week`'s runtime and forwards taps through its
 * `dispatch`; the cards and the look over are the shared bundle's parts
 * (`@some-ui/shared`'s `BundleCards` and `BundleReview`, swiped with
 * `usePager`), and every word is `lib/interview-week/words`'. It owns one
 * runtime for as long as it is mounted (docs/monorepo-boundaries.md, "Inside
 * a React package").
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { assertNever } from "@some-ui/core-utils"
import type { Card, InterviewWeek, Question } from "@some-ui/interview-week"
import {
  BundleCards,
  bundleConfirm,
  BundleReview,
  Button,
  ConfirmSheet,
  Notice,
  TakeRow,
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
import { currentTakeOf, takeItemView } from "@some-ui/voice-capture"
import { ChevronLeft } from "lucide-react"

import type { Cue } from "@/lib/interview-week/cue"
import type { InterviewWeekPorts } from "@/lib/interview-week/runtime"
import { createInterviewWeek } from "@/lib/interview-week/runtime"
import type {
  InterviewAtHome,
  InterviewKind,
  InterviewState,
} from "@/lib/interview-week/spec"
import {
  cardOf,
  isClosed,
  itemsOf,
  readItem,
  sentTakeOf,
  takeLine,
  takesOf,
} from "@/lib/interview-week/spec"
import type { CardStanding } from "@/lib/interview-week/words"
import { INTERVIEW_WORDS as WORDS } from "@/lib/interview-week/words"

type Parts = {
  readonly machine: BundleMachine<InterviewKind>
  readonly state: InterviewState
  readonly takes: BundleTakes
  readonly snapshot: TakePatternSnapshot
  readonly dispatch: (intent: BundleIntent<InterviewKind>) => void
}

type Shown = Parts & {
  readonly week: InterviewWeek
  readonly atHome: InterviewAtHome
  readonly cue: Cue
  readonly back: ReactNode
}

/** Where a card stands: on this phone, sent, or said again since. */
function standing({ machine, state }: Parts, item: string): CardStanding {
  const sent = sentTakeOf(state.sent, item)
  if (sent === null) {
    return machine.answered(state, item) === null ? "open" : "said"
  }
  const now = currentTakeOf(state.takes, takeLine(state.draft.id, item))
  return now !== null && now.id !== sent ? "resaid" : "sent"
}

/** A card's name in the look over: "Question 2", "Read 1". */
function labelOf(week: InterviewWeek, item: string): string {
  const card = cardOf(item)
  return card === null
    ? WORDS.questionLabel(week.questions.findIndex(({ id }) => id === item) + 1)
    : WORDS.readLabel(week.cards.findIndex(({ id }) => id === card) + 1)
}

const Role = ({ week }: { week: InterviewWeek }): JSX.Element => (
  <header className="space-y-1">
    <p className="text-muted-foreground text-xs font-semibold">
      {WORDS.heading(week)}
    </p>
    <h2 className="text-3xl font-extrabold text-balance">
      {WORDS.role(week.role.title, week.company.name)}
    </h2>
    <p className="text-muted-foreground">{week.company.about}</p>
    <p>{week.role.about}</p>
    <p className="bg-card rounded-2xl p-3 text-sm italic">{WORDS.invented}</p>
  </header>
)

const Brief = (props: Shown): JSX.Element => {
  const { machine, state, dispatch, week, atHome } = props
  const items = itemsOf(week)
  const said = machine.answeredCount(state)
  const entry = (item: string, title: string): JSX.Element => (
    <Button
      key={item}
      variant="outline"
      className="h-auto flex-col items-start gap-0.5 rounded-2xl p-3 text-left whitespace-normal"
      onClick={() => dispatch({ type: "go", index: items.indexOf(item) })}
    >
      <span className="font-semibold">{title}</span>
      <span className="text-muted-foreground text-xs font-normal">
        {WORDS.standing[standing(props, item)]}
      </span>
    </Button>
  )
  return (
    <div className="flex flex-col gap-4">
      <Role week={week} />
      {atHome.last !== null && (
        <section className="bg-card flex flex-col gap-1 rounded-2xl p-3 text-sm">
          <p className="font-semibold">
            {atHome.holds?.at === atHome.last.at
              ? WORDS.held(takesOf(atHome.last).length, atHome.last.at)
              : WORDS.goesHome(takesOf(atHome.last).length, atHome.last.at)}
          </p>
          <p className="text-muted-foreground">{WORDS.openUntil(week)}</p>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{WORDS.questions}</h3>
        {week.questions.map((question) => entry(question.id, question.prompt))}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{WORDS.reads}</h3>
        <p className="text-muted-foreground text-sm">{WORDS.readsLine}</p>
        {week.cards.map((card) => entry(readItem(card.id), card.situation))}
      </section>
      <Button
        size="lg"
        variant={said > 0 ? "default" : "outline"}
        onClick={() => dispatch({ type: "review" })}
      >
        {WORDS.toReviewOf(said, items.length)}
      </Button>
      {props.back}
    </div>
  )
}

/** On a card sent before: whether the take here is the one home holds. */
const HomeLine = ({
  standing: now,
}: {
  standing: CardStanding
}): JSX.Element | null =>
  now === "sent" || now === "resaid" ? (
    <p className="text-muted-foreground text-sm">
      {now === "resaid" ? WORDS.home.again : WORDS.home.holds}
    </p>
  ) : null

const QuestionHead = ({
  question,
  n,
  of,
}: {
  question: Question
  n: number
  of: number
}): JSX.Element => (
  <>
    <p className="text-muted-foreground text-xs font-semibold">
      {WORDS.questionOf(n, of)} · {WORDS.aim(question.targetSeconds)}
    </p>
    <h2 className="text-2xl font-extrabold text-balance">{question.prompt}</h2>
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{WORDS.guidelines}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {question.guidelines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  </>
)

/**
 * A read's card above its take: the script, large and scrollable, and under
 * it one line that holds its place whether or not the cue counts (HS1).
 */
const ReadHead = ({
  card,
  n,
  of,
  counting,
}: {
  card: Card
  n: number
  of: number
  counting: number | null
}): JSX.Element => (
  <>
    <p className="text-muted-foreground text-xs font-semibold">
      {WORDS.readOf(n, of)} · {WORDS.aim(card.targetSeconds)}
    </p>
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold">{WORDS.situation}</h3>
      <p className="text-sm">{card.situation}</p>
    </section>
    <section
      aria-label={WORDS.script}
      data-script={card.id}
      data-scroll-intent
      className={
        /* scroll-intent: a teleprompter's script scrolls as it is read, while the take records under it (#2936) */
        "bg-card max-h-[45vh] overflow-y-auto rounded-2xl p-4 text-2xl leading-relaxed font-semibold whitespace-pre-line"
      }
    >
      {card.script}
    </section>
    <p
      aria-live="assertive"
      className="text-muted-foreground min-h-6 text-center text-sm"
    >
      {counting === null ? WORDS.cap : WORDS.cue(counting)}
    </p>
  </>
)

const Cards = (props: Shown): JSX.Element => {
  const { week, cue } = props
  const counting = cue.kind === "counting" ? cue : null
  return (
    <BundleCards
      {...props}
      words={WORDS}
      renderHead={(item) => {
        const card = cardOf(item)
        const asked = week.questions.find(({ id }) => id === item)
        const script = week.cards.find(({ id }) => id === card)
        return (
          <>
            {asked !== undefined && (
              <QuestionHead
                question={asked}
                n={week.questions.indexOf(asked) + 1}
                of={week.questions.length}
              />
            )}
            {script !== undefined && (
              <ReadHead
                card={script}
                n={week.cards.indexOf(script) + 1}
                of={week.cards.length}
                counting={counting?.item === item ? counting.left : null}
              />
            )}
            <HomeLine standing={standing(props, item)} />
          </>
        )
      }}
    />
  )
}

const Review = (props: Shown): JSX.Element => {
  const { machine, state, week } = props
  const needs = machine.missing(state)
  const n = takesOf(machine.bundleRecord(state, state.at)).length
  const notNear = state.reach === "near" ? null : WORDS.notNear[state.reach]
  return (
    <BundleReview
      {...props}
      words={WORDS}
      header={
        <p className="text-muted-foreground text-sm">{WORDS.review.kept}</p>
      }
      label={(item) => labelOf(week, item)}
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
const rowOf = (view: TakeItemView, take: string | null): TakeRowView | null =>
  [...view.current, ...view.earlier].find((row) => row.take.id === take) ?? null

/** Each card with the take `sent` holds for it, playable, or "Not said.". */
const SentList = (
  props: Shown & { sent: InterviewState["sent"]; readOnly: boolean }
): JSX.Element => {
  const { machine, state, snapshot, takes, dispatch, week, sent } = props
  return (
    <ol className="flex flex-col gap-3">
      {itemsOf(week).map((item) => {
        const take = sentTakeOf(sent, item)
        const row = rowOf(
          takeItemView(
            snapshot,
            state.takes,
            machine.answersOf(state, item),
            takes.pattern.options
          ),
          take
        )
        return (
          <li key={item} className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{labelOf(week, item)}</p>
            {take === null || row === null ? (
              <p className="text-muted-foreground text-sm">
                {WORDS.sent.notSaid}
              </p>
            ) : (
              <TakeRow
                row={
                  props.readOnly
                    ? { ...row, canRedo: false, canLetGo: false }
                    : row
                }
                onPlay={() => dispatch({ type: "play", take: row.take.id })}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

const Sent = (props: Shown): JSX.Element => {
  const { state, dispatch } = props
  return (
    <div className="flex flex-col gap-4">
      <h2 aria-live="polite" className="text-3xl font-extrabold">
        {WORDS.sent.title(state.sent === null ? 0 : takesOf(state.sent).length)}
      </h2>
      <p className="text-muted-foreground">{WORDS.sent.line}</p>
      <p className="text-muted-foreground">{WORDS.openUntil(props.week)}</p>
      <Button size="lg" onClick={() => dispatch({ type: "back" })}>
        {WORDS.backToWeek}
      </Button>
      <SentList {...props} sent={state.sent} readOnly={false} />
      {props.back}
    </div>
  )
}

/** The week read back once it closed: what home had at the deadline. Nothing records or sends. */
const ReadBack = (props: Shown): JSX.Element => {
  const { week, atHome } = props
  const { holds, last } = atHome
  return (
    <div className="flex flex-col gap-4">
      <Role week={week} />
      <section className="bg-card flex flex-col gap-1 rounded-2xl p-3 text-sm">
        <p className="font-semibold">{WORDS.closed.title(week)}</p>
        <p className="text-muted-foreground">{WORDS.closed.line(week)}</p>
        <p>{WORDS.closed.held(holds === null ? 0 : takesOf(holds).length)}</p>
        {last !== null && last.at !== holds?.at && (
          <p className="text-muted-foreground">{WORDS.closed.late(last.at)}</p>
        )}
      </section>
      <SentList {...props} sent={holds} readOnly />
      {props.back}
    </div>
  )
}

const Screen = (props: Shown): JSX.Element => {
  const { state, dispatch, week } = props
  if (
    state.screen !== "loading" &&
    state.screen !== "unreadable" &&
    isClosed(week, state.at)
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
      return <Cards {...props} />
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

export type InterviewWeekScreenProps = {
  /** The phone's ports. Read once, on mount. */
  ports: InterviewWeekPorts
  /** The way out, on the brief and once sent. */
  back?: ReactNode
}

export const InterviewWeekScreen = ({
  ports,
  back,
}: InterviewWeekScreenProps): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime, and the week and takes it runs on, are made once per mount, as Rust Rounds' week's are */
  const [{ run, desk, week }] = useState(() => ({
    run: createInterviewWeek(ports),
    desk: ports.takes,
    week: ports.week.week,
  }))
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => run.attach(), [run])
  const state = useSyncExternalStore(
    run.bundle.subscribe,
    run.bundle.getSnapshot
  )
  const atHome = useSyncExternalStore(
    run.atHome.subscribe,
    run.atHome.getSnapshot
  )
  const cue = useSyncExternalStore(run.cue.subscribe, run.cue.getSnapshot)
  const snapshot = useTakePattern(desk.pattern)
  const { dispatch } = run
  const backable =
    !isClosed(week, state.at) &&
    (state.screen === "cards" || state.screen === "review")
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
      <Screen
        machine={run.machine}
        state={state}
        takes={desk}
        snapshot={snapshot}
        dispatch={dispatch}
        week={week}
        atHome={atHome}
        cue={cue}
        back={back}
      />
      <ConfirmSheet
        request={bundleConfirm(
          { machine: run.machine, state, dispatch, words: WORDS },
          (item) => labelOf(week, item)
        )}
        open={state.confirm !== null}
        onOpenChange={(open) => {
          if (!open && state.confirm !== null) dispatch({ type: "keepIt" })
        }}
      />
    </div>
  )
}

/** While this phone holds no week from home. */
export const NoInterviewWeek = (): JSX.Element => (
  <section className="bg-card flex flex-col gap-2 rounded-2xl p-4">
    <h2 className="text-xl font-bold">{WORDS.none.title}</h2>
    <p className="text-muted-foreground text-sm">{WORDS.none.line}</p>
  </section>
)
