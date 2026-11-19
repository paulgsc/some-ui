/**
 * The interview week's own page (IW5, IW8; paulgsc/some-ui#2936, #3175): the
 * invented role, today's question as one tap, Read aloud's way in, the
 * week's other questions, and the look over and send. Each question, its
 * ready answer, its read aloud and each take are pages of their own
 * (`./ladder`, `./reads`); this one only links to them. It says what was
 * done, in the past tense, and nothing about what wasn't. The look over,
 * the sent page and the week read back once closed are IW5's, a step on
 * this page's bundle screen; a take started from the look over opens its
 * item's page instead.
 */
import type { JSX, ReactNode } from "react"
import { assertNever, pacificDay } from "@some-ui/core-utils"
import type { InterviewWeek } from "@some-ui/interview-week"
import { questionOfDay } from "@some-ui/interview-week"
import { BundleReview, Button, Notice, TakeRow } from "@some-ui/shared"
import type {
  BundleIntent,
  TakeItemView,
  TakeRowView,
} from "@some-ui/voice-capture"

import type { InterviewKind, InterviewState } from "@/lib/interview-week/spec"
import {
  cardOf,
  isClosed,
  itemsOf,
  sentTakeOf,
  takesOf,
} from "@/lib/interview-week/spec"
import { INTERVIEW_WORDS as WORDS } from "@/lib/interview-week/words"

import type { Interview } from "./run"
import { currentOf, labelOf, playOnly, useInterview, viewOf } from "./run"
import { To, useOpenItem } from "./to"

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

/** What was last done with `item` this week, in the past tense; null while nothing was. */
export function doneLine(
  { state, ladder }: Pick<Interview, "state" | "ladder">,
  item: string
): string | null {
  const take = currentOf({ state }, item)
  if (take === null) return null
  // A read is read aloud; a question's take is said on its rung.
  const did =
    cardOf(item) === null ? (ladder.rungs[take.id] ?? "said") : "aloud"
  return WORDS.done(WORDS.past[did], take.recordedAt)
}

const Home = ({ held }: { held: Interview }): JSX.Element => {
  const { week, state, atHome, run } = held
  const today = questionOfDay(week, pacificDay(new Date(state.at)))
  const others = week.questions.filter(({ id }) => id !== today?.id)
  const entry = (id: string, prompt: string): JSX.Element => {
    const done = doneLine(held, id)
    return (
      <To card="card" key={id} to={{ page: "question", question: id }}>
        <span className="font-semibold">{prompt}</span>
        {done !== null && (
          <span className="text-muted-foreground text-xs">{done}</span>
        )}
      </To>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <Role week={week} />
      {today !== null && (
        <To to={{ page: "question", question: today.id }} card="brand">
          <span className="text-xs font-semibold opacity-85">
            {WORDS.today}
          </span>
          <span className="text-xl leading-tight font-extrabold text-balance">
            {today.prompt}
          </span>
          <span className="text-xs font-semibold opacity-85">
            {doneLine(held, today.id) ?? WORDS.todayLine}
          </span>
        </To>
      )}
      <section className="bg-card flex flex-col gap-2 rounded-2xl border p-3">
        <p className="text-sm">{WORDS.readsEntry}</p>
        <Button asChild variant="outline" className="self-start">
          <To to={{ page: "reads" }}>{WORDS.reads}</To>
        </Button>
      </section>
      {others.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">
            {today === null ? WORDS.questions : WORDS.others}
          </h3>
          {others.map(({ id, prompt }) => entry(id, prompt))}
        </section>
      )}
      {atHome.last !== null && (
        <section className="bg-card flex flex-col gap-1 rounded-2xl p-3 text-sm">
          <p className="font-semibold">
            {atHome.holds?.at === atHome.last.at
              ? WORDS.held(takesOf(atHome.last).length, atHome.last.at)
              : WORDS.goesHome(takesOf(atHome.last).length, atHome.last.at)}
          </p>
        </section>
      )}
      <Button
        size="lg"
        variant="outline"
        onClick={() => run.dispatch({ type: "review" })}
      >
        {WORDS.toReview}
      </Button>
      <p className="text-muted-foreground text-sm">
        {WORDS.kept} {WORDS.openUntil(week)}
      </p>
    </div>
  )
}

const Review = ({ held }: { held: Interview }): JSX.Element => {
  const { run, state, week, takes, snapshot } = held
  const open = useOpenItem()
  const { machine } = run
  const needs = machine.missing(state)
  const n = takesOf(machine.bundleRecord(state, state.at)).length
  const notNear = state.reach === "near" ? null : WORDS.notNear[state.reach]
  const dispatch = (intent: BundleIntent<InterviewKind>): void => {
    if (intent.type === "tap" && !state.busy) {
      const card = cardOf(intent.item)
      open(
        card === null
          ? { page: "question", question: intent.item }
          : { page: "read", card }
      )
    } else run.dispatch(intent)
  }
  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={state.busy}
        onClick={() => run.dispatch({ type: "back" })}
      >
        {WORDS.back}
      </Button>
      <BundleReview
        machine={machine}
        state={state}
        takes={takes}
        snapshot={snapshot}
        dispatch={dispatch}
        words={WORDS}
        header={
          <p className="text-muted-foreground text-sm">{WORDS.review.kept}</p>
        }
        label={(item) => labelOf(week, item)}
        beforeSend={
          notNear !== null && (
            <p className="text-muted-foreground text-center text-sm">
              {notNear}
            </p>
          )
        }
        send={state.sent === null ? WORDS.send(n) : WORDS.sendAgain(n)}
        needs={
          needs === null || needs === "required" ? null : WORDS.needs[needs]
        }
      />
    </div>
  )
}

/** The row of the take `take`, current or superseded since, if this phone lists it. */
const rowOf = (view: TakeItemView, take: string | null): TakeRowView | null =>
  [...view.current, ...view.earlier].find((row) => row.take.id === take) ?? null

/** Each card with the take `sent` holds for it, playable, or "Not said.". */
const SentList = ({
  held,
  sent,
  readOnly,
}: {
  held: Interview
  sent: InterviewState["sent"]
  readOnly: boolean
}): JSX.Element => {
  const { run, week } = held
  return (
    <ol className="flex flex-col gap-3">
      {itemsOf(week).map((item) => {
        const take = sentTakeOf(sent, item)
        const row = rowOf(viewOf(held, item), take)
        return (
          <li key={item} className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{labelOf(week, item)}</p>
            {take === null || row === null ? (
              <p className="text-muted-foreground text-sm">
                {WORDS.sent.notSaid}
              </p>
            ) : (
              <TakeRow
                row={readOnly ? playOnly(row) : row}
                onPlay={() => run.dispatch({ type: "play", take: row.take.id })}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

const Sent = ({ held }: { held: Interview }): JSX.Element => {
  const { state, run, week } = held
  return (
    <div className="flex flex-col gap-4">
      <h2 aria-live="polite" className="text-3xl font-extrabold">
        {WORDS.sent.title(state.sent === null ? 0 : takesOf(state.sent).length)}
      </h2>
      <p className="text-muted-foreground">{WORDS.sent.line}</p>
      <p className="text-muted-foreground">{WORDS.openUntil(week)}</p>
      <Button size="lg" onClick={() => run.dispatch({ type: "back" })}>
        {WORDS.backToWeek}
      </Button>
      <SentList held={held} sent={state.sent} readOnly={false} />
    </div>
  )
}

/** The week read back once it closed: what home had at the deadline. Nothing records or sends. */
const ReadBack = ({ held }: { held: Interview }): JSX.Element => {
  const { week, atHome } = held
  const { holds, last } = atHome
  return (
    <div className="flex flex-col gap-4">
      <Role week={week} />
      <section className="bg-card flex flex-col gap-1 rounded-2xl p-3 text-sm">
        <p className="font-semibold">{WORDS.closed.title(week)}</p>
        <p className="text-muted-foreground">{WORDS.closed.line(week)}</p>
        <p>
          {holds === null
            ? WORDS.closed.noSend
            : WORDS.closed.held(takesOf(holds).length)}
        </p>
        {last !== null && last.at !== holds?.at && (
          <p className="text-muted-foreground">{WORDS.closed.late(last.at)}</p>
        )}
      </section>
      <SentList held={held} sent={holds} readOnly />
    </div>
  )
}

/** While the week is read, or can't be: what every page shows in its place. */
export const Opening = ({
  held,
  children,
}: {
  held: Interview
  children: ReactNode
}): JSX.Element => {
  const { state, run } = held
  switch (state.screen) {
    case "loading": {
      return <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
    }
    case "unreadable": {
      return (
        <Notice
          tone="danger"
          action={{
            label: WORDS.readAgain,
            onClick: () => run.dispatch({ type: "readAgain" }),
          }}
        >
          {WORDS.unreadable}
        </Notice>
      )
    }
    case "intro":
    case "cards":
    case "review":
    case "sent": {
      return <>{children}</>
    }
    default: {
      return assertNever(state.screen)
    }
  }
}

/** The Interview page: its screen as the bundle stands. */
export const InterviewPage = (): JSX.Element => {
  const held = useInterview()
  const { state, week } = held
  return (
    <Opening held={held}>
      {isClosed(week, state.at) ? (
        <ReadBack held={held} />
      ) : state.screen === "review" ? (
        <Review held={held} />
      ) : state.screen === "sent" ? (
        <Sent held={held} />
      ) : (
        <Home held={held} />
      )}
    </Opening>
  )
}
