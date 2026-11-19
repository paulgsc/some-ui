/**
 * A question's ladder, each step a page of its own (IW8,
 * paulgsc/some-ui#3175): the question with its rungs at equal weight and its
 * latest take; the study page (the ready answer with a note on why each part
 * works, another good answer, a poor one with notes); the answer read aloud;
 * and the take page, said from cues or your own way. A week written before
 * ready answers offers the last two rungs only (`stepsOf`). Each page names
 * its way back, and Android's back steps through them too.
 */
import type { JSX, ReactNode } from "react"
import { useEffect } from "react"
import type { Question, WorkSource } from "@some-ui/interview-week"
import { workSourceKey } from "@some-ui/interview-week"
import { BundleTake, TakeRow } from "@some-ui/shared"
import { ChevronLeft } from "lucide-react"

import type { Rung, SayRung, Step } from "@/lib/interview-week/ladder"
import { scriptOf, stepsOf } from "@/lib/interview-week/ladder"
import { isClosed, sentTakeOf } from "@/lib/interview-week/spec"
import { INTERVIEW_WORDS as WORDS } from "@/lib/interview-week/words"

import type { Interview } from "./run"
import { currentOf, playOnly, useInterview, viewOf } from "./run"
import type { Page } from "./to"
import { CardTo, To } from "./to"
import { doneLine, Opening } from "./week"

/** A page's way back: a link, so Android's back and this step the same way. */
export const BackTo = ({
  to,
  children,
}: {
  to: Page
  children: ReactNode
}): JSX.Element => (
  <To
    to={to}
    className="hover:bg-muted inline-flex items-center gap-0.5 self-start rounded-xl px-2 py-1.5 text-sm font-semibold"
  >
    <ChevronLeft className="size-4" aria-hidden="true" />
    {children}
  </To>
)

/** Shows `item` on the week's runtime while the page is up. */
export function useFocus(held: Interview, item: string): void {
  const { run } = held
  useEffect(() => run.focus(item), [run, item])
}

/** The week's question `id`, or a line saying it isn't in this week. */
const WithQuestion = ({
  id,
  children,
}: {
  id: string
  children: (question: Question, held: Interview) => ReactNode
}): JSX.Element => {
  const held = useInterview()
  const question = held.week.questions.find((asked) => asked.id === id)
  return (
    <div className="flex flex-col gap-4">
      {question === undefined ? (
        <>
          <BackTo to={{ page: "questions" }}>{WORDS.toQuestions}</BackTo>
          <p className="text-muted-foreground">{WORDS.notInWeek}</p>
        </>
      ) : (
        <Opening held={held}>{children(question, held)}</Opening>
      )}
    </div>
  )
}

const Head = ({
  question,
  eyebrow,
  small = false,
}: {
  question: Question
  eyebrow: string
  small?: boolean
}): JSX.Element => (
  <div className="flex flex-col gap-1.5">
    <p className="text-muted-foreground text-xs font-semibold">{eyebrow}</p>
    <h2
      className={
        small
          ? "text-xl leading-tight font-extrabold text-balance"
          : "text-2xl leading-tight font-extrabold text-balance"
      }
    >
      {question.prompt}
    </h2>
  </div>
)

/** One rung, as a link to its page. */
const RungLink = ({
  step,
  n,
  question,
}: {
  step: Step
  n: number
  question: string
}): JSX.Element => {
  const inside = (
    <>
      <span className="text-muted-foreground text-xs font-bold">{n}</span>
      <span className="leading-tight font-bold">{WORDS.step[step].name}</span>
      <span className="text-muted-foreground text-xs">
        {WORDS.step[step].line}
      </span>
    </>
  )
  return (
    <CardTo
      to={
        step === "cues" || step === "own"
          ? { page: "say", question, rung: step }
          : { page: step, question }
      }
      className="min-h-28"
    >
      {inside}
    </CardTo>
  )
}

/** The question's latest take, playable, and that saying it again replaces it here. */
const LatestTake = ({
  held,
  question,
}: {
  held: Interview
  question: string
}): JSX.Element | null => {
  const { run } = held
  const row = viewOf(held, question).current.at(0)
  const done = doneLine(held, question)
  if (row === undefined || done === null) return null
  return (
    <section className="flex flex-col gap-1.5">
      <p className="text-sm">
        <strong>{WORDS.yourTake}</strong>, {done}
      </p>
      <TakeRow
        row={playOnly(row)}
        onPlay={() => run.dispatch({ type: "play", take: row.take.id })}
      />
      <p className="text-muted-foreground text-sm">{WORDS.inItsPlace}</p>
    </section>
  )
}

/** A question and its ladder. */
export const QuestionPage = ({ id }: { id: string }): JSX.Element => (
  <WithQuestion id={id}>
    {(question, held) => (
      <>
        <BackTo to={{ page: "questions" }}>{WORDS.toQuestions}</BackTo>
        <Head question={question} eyebrow={WORDS.aim(question.targetSeconds)} />
        <nav className="grid grid-cols-2 gap-2.5">
          {stepsOf(question).map((step, i) => (
            <RungLink key={step} step={step} n={i + 1} question={question.id} />
          ))}
        </nav>
        <LatestTake held={held} question={question.id} />
        <section className="bg-card flex flex-col gap-1 rounded-2xl border p-3">
          <h3 className="text-sm font-semibold">{WORDS.guidelines}</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {question.guidelines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </>
    )}
  </WithQuestion>
)

/** A claim's sources, as chips: on a question about the body of work only. */
const Sources = ({
  sources,
  shown,
}: {
  sources: ReadonlyArray<WorkSource>
  shown: boolean
}): JSX.Element | null =>
  !shown || sources.length === 0 ? null : (
    <span className="flex flex-wrap gap-1">
      {sources.map((source) => (
        <span
          key={workSourceKey(source)}
          className="text-muted-foreground rounded-full border px-2 text-xs font-semibold tabular-nums"
        >
          {WORDS.source(source)}
        </span>
      ))}
    </span>
  )

const Note = ({ children }: { children: ReactNode }): JSX.Element => (
  <p className="border-brand text-muted-foreground border-l-4 py-0.5 pl-2.5 text-sm">
    {children}
  </p>
)

/** The study page: the ready answer and its notes, another good answer, a poor one. */
export const StudyPage = ({ id }: { id: string }): JSX.Element => (
  <WithQuestion id={id}>
    {(question) => {
      const back = (
        <BackTo to={{ page: "question", question: id }}>
          {WORDS.toQuestion}
        </BackTo>
      )
      const { ready } = question
      if (ready === undefined) return back
      const work = question.ground === "work"
      return (
        <>
          {back}
          <Head
            question={question}
            eyebrow={WORDS.aim(question.targetSeconds)}
            small
          />
          <p className="text-muted-foreground text-sm">
            {work ? WORDS.study.work : WORDS.study.open}
          </p>
          <section className="flex flex-col gap-3 border-t pt-3">
            <h3 className="text-muted-foreground text-sm">
              {WORDS.study.ready}
            </h3>
            {ready.answer.map((part) => (
              <div key={part.label} className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs font-bold">
                  {part.label}
                </span>
                <p className="text-lg leading-relaxed">{part.text}</p>
                <Sources sources={part.sources} shown={work} />
                <Note>{part.note}</Note>
              </div>
            ))}
          </section>
          <section className="flex flex-col gap-2 border-t pt-3">
            <h3 className="text-muted-foreground text-sm">
              {WORDS.study.another}
            </h3>
            <p className="text-lg leading-relaxed">{ready.another.text}</p>
            <Sources sources={ready.another.sources} shown={work} />
            <Note>{ready.another.note}</Note>
          </section>
          <section className="flex flex-col gap-2 border-t pt-3">
            <h3 className="text-muted-foreground text-sm">
              {WORDS.study.poor}
            </h3>
            <p className="text-lg leading-relaxed italic">{ready.poor.text}</p>
            <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
              {ready.poor.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
          <To
            to={{ page: "aloud", question: id }}
            className="bg-primary text-primary-foreground self-start rounded-full px-5 py-3 font-bold"
          >
            {WORDS.step.aloud.name}
          </To>
        </>
      )
    }}
  </WithQuestion>
)

/** A script read aloud, a phrase a line, large and scrollable while the take records under it. */
export const Script = ({
  lines,
  id,
}: {
  lines: ReadonlyArray<string>
  id: string
}): JSX.Element => (
  <section
    aria-label={WORDS.script}
    data-script={id}
    data-scroll-intent
    className={
      /* scroll-intent: a teleprompter's script scrolls as it is read, while the take records under it (#2936) */
      "bg-card flex max-h-[45vh] flex-col gap-2 overflow-y-auto rounded-2xl p-4 text-2xl leading-snug font-semibold"
    }
  >
    {lines.map((line, i) => (
      // A script can say a phrase twice; its place is its key.
      // eslint-disable-next-line react/no-array-index-key
      <p key={i}>{line}</p>
    ))}
  </section>
)

/** Under a read's script: the cap, or how to call the count-in off while it runs, holding its place (HS1). */
export const CueLine = ({
  held,
  item,
}: {
  held: Interview
  item: string
}): JSX.Element => {
  const { cue } = held
  return (
    <p
      aria-live="assertive"
      className="text-muted-foreground min-h-6 text-center text-sm"
    >
      {cue.kind === "counting" && cue.item === item ? WORDS.cueLine : WORDS.cap}
    </p>
  )
}

/** Once the week was sent: whether the take here is the one home holds. */
const HomeLine = ({
  held,
  item,
}: {
  held: Interview
  item: string
}): JSX.Element | null => {
  const { state } = held
  const sent = sentTakeOf(state.sent, item)
  if (sent === null) return null
  const now = currentOf(held, item)
  return (
    <p className="text-muted-foreground text-sm">
      {now !== null && now.id !== sent ? WORDS.home.again : WORDS.home.holds}
    </p>
  )
}

/** A take on `item`, or, once the week has closed, that nothing more is said. */
export const TakeOn = ({
  held,
  item,
  rung,
  head,
}: {
  held: Interview
  item: string
  rung: Rung | null
  head: ReactNode
}): JSX.Element => {
  const { run, state, takes, snapshot, week, cue } = held
  if (isClosed(week, state.at)) {
    return (
      <>
        {head}
        <p className="text-muted-foreground text-sm">
          {WORDS.closed.line(week)}
        </p>
      </>
    )
  }
  return (
    <BundleTake
      machine={run.machine}
      state={state}
      takes={takes}
      snapshot={snapshot}
      dispatch={rung === null ? run.dispatch : run.dispatchOn(rung)}
      words={WORDS}
      item={item}
      counting={cue.kind === "counting" && cue.item === item ? cue.left : null}
      head={
        <>
          {head}
          <HomeLine held={held} item={item} />
        </>
      }
    />
  )
}

const AloudTake = ({
  held,
  question,
}: {
  held: Interview
  question: Question
}): JSX.Element => {
  useFocus(held, question.id)
  const { ready } = question
  return (
    <TakeOn
      held={held}
      item={question.id}
      rung="aloud"
      head={
        <>
          <p className="text-muted-foreground text-xs font-semibold">
            {WORDS.step.aloud.name} · {WORDS.aim(question.targetSeconds)}
          </p>
          {ready !== undefined && (
            <Script lines={scriptOf(ready)} id={question.id} />
          )}
          <CueLine held={held} item={question.id} />
        </>
      }
    />
  )
}

/** The ready answer read aloud, a phrase a line, with its take. */
export const AloudPage = ({ id }: { id: string }): JSX.Element => (
  <WithQuestion id={id}>
    {(question, held) => (
      <>
        {question.ready === undefined ? (
          // A week written before ready answers has none to read aloud.
          <BackTo to={{ page: "question", question: id }}>
            {WORDS.toQuestion}
          </BackTo>
        ) : (
          <>
            <BackTo to={{ page: "study", question: id }}>
              {WORDS.toAnswer}
            </BackTo>
            <AloudTake held={held} question={question} />
          </>
        )}
      </>
    )}
  </WithQuestion>
)

const SayTake = ({
  held,
  question,
  rung,
}: {
  held: Interview
  question: Question
  rung: SayRung
}): JSX.Element => {
  useFocus(held, question.id)
  // A week written before ready answers leans on what to cover.
  const cues =
    rung === "cues" ? (question.ready?.cues ?? question.guidelines) : []
  return (
    <TakeOn
      held={held}
      item={question.id}
      rung={rung}
      head={
        <>
          <Head
            question={question}
            eyebrow={`${WORDS.step[rung].name} · ${WORDS.aim(question.targetSeconds)}`}
            small
          />
          {cues.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {cues.map((cue) => (
                <li
                  key={cue}
                  className="bg-card rounded-full border px-3 py-1.5 text-sm font-semibold"
                >
                  {cue}
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground text-sm">{WORDS.cap}</p>
        </>
      }
    />
  )
}

/** The take page: said from cues, or your own way. */
export const SayPage = ({
  id,
  rung,
}: {
  id: string
  rung: SayRung
}): JSX.Element => (
  <WithQuestion id={id}>
    {(question, held) => (
      <>
        <BackTo to={{ page: "question", question: id }}>
          {WORDS.toQuestion}
        </BackTo>
        <SayTake held={held} question={question} rung={rung} />
      </>
    )}
  </WithQuestion>
)
