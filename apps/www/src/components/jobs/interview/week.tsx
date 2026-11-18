/**
 * The interview week's first page (IW5, IW8, IW15, IW16; paulgsc/some-ui#2936,
 * #3175, #3224, #3225), its look over and send. Before anything is said this
 * week it is the way in: what this is, the kinds of practice and what each
 * costs, and how a week goes (`./way-in`). Once something is said or sent it
 * lists what was done, each take where it is, and the send. Each kind, each
 * question and each take is a page of its own (`./way-in`, `./ladder`,
 * `./reads`); this one only links to them. It says what was done, in the
 * past tense, and nothing about what wasn't. The look over, the sent page
 * and the week read back once closed are IW5's, a step on this page's bundle
 * screen; a take started from the look over opens its item's page instead. */
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
  readItem,
  sentTakeOf,
  takesOf,
} from "@/lib/interview-week/spec"
import { INTERVIEW_WORDS as WORDS } from "@/lib/interview-week/words"

import type { Interview } from "./run"
import { currentOf, labelOf, playOnly, useInterview, viewOf } from "./run"
import type { Page } from "./to"
import { CardTo, useOpenItem } from "./to"

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

/** A typical length for `seconds`, to the half minute: what each kind costs. */
const typical = (seconds: ReadonlyArray<number>): number =>
  Math.max(
    30,
    Math.round(seconds.reduce((a, b) => a + b, 0) / seconds.length / 30) * 30
  )

/** What a question or a read is called on the first page. */
const nameOf = (week: InterviewWeek, item: string): string => {
  const card = cardOf(item)
  return card === null
    ? (week.questions.find(({ id }) => id === item)?.prompt ?? item)
    : (week.cards.find(({ id }) => id === card)?.situation ?? item)
}

/** A kind of practice, as a link to its page. */
const Kind = ({
  to,
  name,
  lines,
}: {
  to: Page
  name: string
  lines: ReadonlyArray<string>
}): JSX.Element => (
  <CardTo to={to}>
    <span className="font-bold">{name}</span>
    {lines.map((line) => (
      <span key={line} className="text-muted-foreground text-sm">
        {line}
      </span>
    ))}
  </CardTo>
)

/** The way to How a week goes. */
const HowLink = (): JSX.Element => (
  <Kind
    to={{ page: "how" }}
    name={WORDS.wayIn.how}
    lines={[WORDS.wayIn.howLine]}
  />
)

/**
 * The first page before anything was said this week (IW15): what this is,
 * the kinds of practice and what each costs, and how a week goes.
 */
const Fresh = ({ week }: { week: InterviewWeek }): JSX.Element => {
  const { questions, cards } = week
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <p className="text-muted-foreground text-xs font-semibold">
          {WORDS.heading(week)}
        </p>
        <h2 className="text-3xl font-extrabold text-balance">
          {WORDS.wayIn.title}
        </h2>
        <p className="text-muted-foreground">
          {WORDS.wayIn.line(week.role.title, week.company.name)}
        </p>
      </header>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{WORDS.wayIn.kinds}</h3>
        <Kind
          to={{ page: "questions" }}
          name={WORDS.questions}
          lines={[
            WORDS.wayIn.questions.what,
            WORDS.wayIn.questions.cost(
              questions.length,
              typical(questions.map(({ targetSeconds }) => targetSeconds))
            ),
          ]}
        />
        <Kind
          to={{ page: "reads" }}
          name={WORDS.reads}
          lines={[
            WORDS.wayIn.reads.what,
            WORDS.wayIn.reads.cost(
              cards.length,
              typical(cards.map(({ targetSeconds }) => targetSeconds))
            ),
          ]}
        />
        <p className="text-muted-foreground text-sm">{WORDS.wayIn.anyOrder}</p>
      </section>
      <HowLink />
    </div>
  )
}

/**
 * The first page once something was said or sent this week (IW16): what was
 * done, each take where it is, the kinds, and the send. Nothing counts what
 * wasn't done.
 */
const UnderWay = ({ held }: { held: Interview }): JSX.Element => {
  const { week, state, atHome, run } = held
  const today = questionOfDay(week, pacificDay(new Date(state.at)))
  const said = itemsOf(week).flatMap((item) => {
    const take = currentOf(held, item)
    const row = take === null ? null : rowOf(viewOf(held, item), take.id)
    return row === null ? [] : [{ item, row }]
  })
  const lastRead = week.cards
    .map(({ id }) => doneLine(held, readItem(id)))
    .find((line) => line !== null)
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <p className="text-muted-foreground text-xs font-semibold">
          {WORDS.heading(week)}
        </p>
        <h2 className="text-3xl font-extrabold text-balance">
          {WORDS.role(week.role.title, week.company.name)}
        </h2>
      </header>
      {said.length > 0 && (
        <section className="bg-card flex flex-col gap-3 rounded-2xl border p-3">
          <h3 className="text-sm font-semibold">{WORDS.wayIn.soFar}</h3>
          <ol className="flex flex-col gap-3">
            {said.map(({ item, row }) => (
              <li key={item} className="flex flex-col gap-1">
                <p className="text-sm font-semibold">{nameOf(week, item)}</p>
                <TakeRow
                  row={playOnly(row)}
                  onPlay={() =>
                    run.dispatch({ type: "play", take: row.take.id })
                  }
                />
              </li>
            ))}
          </ol>
        </section>
      )}
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
        <Kind
          to={{ page: "questions" }}
          name={WORDS.questions}
          lines={[
            today === null
              ? WORDS.wayIn.questions.what
              : WORDS.wayIn.todayIs(today.prompt),
          ]}
        />
        <Kind
          to={{ page: "reads" }}
          name={WORDS.reads}
          lines={[lastRead ?? WORDS.wayIn.reads.what]}
        />
      </section>
      <Button size="lg" onClick={() => run.dispatch({ type: "review" })}>
        {WORDS.toReview}
      </Button>
      <HowLink />
    </div>
  )
}

/** Whether anything was said or sent this week. */
const isUnderWay = (held: Interview): boolean =>
  held.atHome.last !== null ||
  itemsOf(held.week).some((item) => currentOf(held, item) !== null)

const Home = ({ held }: { held: Interview }): JSX.Element =>
  isUnderWay(held) ? <UnderWay held={held} /> : <Fresh week={held.week} />

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
