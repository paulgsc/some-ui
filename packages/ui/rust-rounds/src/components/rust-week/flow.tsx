/**
 * A week's tickets as a flow (RR25, #3249; RR29, #3257; the owner's
 * approved prototype, C690): each ticket read, then worked in its academy,
 * then voiced, every step of every ticket a page of one pager (`usePager`,
 * GES5) with Prev and Next beside it. Forks are not paged inside a step.
 *
 * - **Read:** the ticket, what it has to meet by id (S…, F…), the program
 *   and rustc's result, then each fork: the agent's options, one marked
 *   recommended, each with what it trades on and the model it rests on.
 * - **Academy:** the exercises, each naming the options it tests, never
 *   whether one is right (C694); one opens to its starter, what to try and
 *   what to have clarity on, and the owner ticks it worked at the desk.
 *   rustc's recorded answer is never shown (C672).
 * - **Voice:** RR24's per-point takes (`PointTakes`), with a pick at each
 *   fork (`DecisionPick`) and its line when folded; a fork left alone goes
 *   with the recommended, and says so.
 *
 * It renders `lib/week-play/flow-runtime`'s state and forwards taps; every
 * word is `lib/week-play/words`' `flow`. A change the phone couldn't keep is
 * said by the week's screen (`RustWeek`), which outlasts these pages. Only
 * the step's own buttons mark a step (`lib/flow`'s `leave`); a swipe or a
 * tap on the step row only moves.
 */
import type { JSX, ReactNode } from "react"
import { useSyncExternalStore } from "react"
import { pointRecording, PointTakes } from "@rust-rounds/components/point-takes"
import { RunView } from "@rust-rounds/components/rustc-run"
import { Tracker } from "@rust-rounds/components/work-tracker"
import { currentPick } from "@rust-rounds/lib/decisions"
import type { FlowStep } from "@rust-rounds/lib/flow"
import { stepStanding, ticked } from "@rust-rounds/lib/flow"
import type { Exercise, Ticket, Week } from "@rust-rounds/lib/formats/week"
import { tickedRuns } from "@rust-rounds/lib/rustc-view"
import type {
  FlowRuntime,
  FlowState,
} from "@rust-rounds/lib/week-play/flow-runtime"
import { pointItem } from "@rust-rounds/lib/week-play/points"
import type { WeekKind, WeekState } from "@rust-rounds/lib/week-play/spec"
import { WEEK_WORDS } from "@rust-rounds/lib/week-play/words"
import type { HeldWeek } from "@rust-rounds/lib/weeks"
import { cn } from "@some-ui/core-utils"
import {
  Button,
  CardLink,
  CardLinkBody,
  CodeCard,
  DecisionPick,
  PageControls,
  usePager,
} from "@some-ui/shared"
import type {
  BundleIntent,
  BundleMachine,
  BundleTakes,
  TakePatternSnapshot,
} from "@some-ui/voice-capture"
import { ChevronLeft } from "lucide-react"

const WORDS = WEEK_WORDS
const FLOW = WEEK_WORDS.flow

export type FlowPagesProps = {
  readonly machine: BundleMachine<WeekKind>
  readonly state: WeekState
  readonly takes: BundleTakes
  readonly snapshot: TakePatternSnapshot
  readonly dispatch: (intent: BundleIntent<WeekKind>) => void
  readonly held: HeldWeek
  readonly flow: FlowRuntime
}

/** "1 · 2", the forks an exercise builds toward. */
const forksOf = (exercise: Exercise): string => exercise.forks.join(FLOW.dot)

/** The options an exercise tests, said: "fork 1's option B and fork 2's option A". */
const testsOf = (exercise: Exercise): string =>
  exercise.tests
    .map(({ fork, option }) => FLOW.academy.option(fork, option))
    .join(FLOW.academy.and)

/** The week's words, each backticked name drawn as code, without its ticks. */
const Ticked = ({ text }: { text: string }): JSX.Element => (
  <>
    {tickedRuns(text).map((run, at) =>
      run.ticked ? (
        // eslint-disable-next-line react/no-array-index-key
        <code key={at} className="font-mono text-[0.9em]">
          {run.text.slice(1, -1)}
        </code>
      ) : (
        run.text
      )
    )}
  </>
)

const Keywords = ({ words }: { words: ReadonlyArray<string> }): JSX.Element => (
  <ul className="flex flex-wrap gap-1.5">
    {words.map((word) => (
      <li
        key={word}
        className="bg-muted rounded-full px-2 py-0.5 font-mono text-xs"
      >
        {word}
      </li>
    ))}
  </ul>
)

/** The ids a row cites, quietly. */
const Ids = ({ ids }: { ids: ReadonlyArray<string> }): JSX.Element => (
  <span className="text-muted-foreground font-mono text-xs">
    {ids.join(" ")}
  </span>
)

/** What the week has to meet, by id: the SLA, then the ticket's figures. */
const Constraints = ({
  week,
  ticket,
}: {
  week: Week
  ticket: Ticket
}): JSX.Element => (
  <section className="flex flex-col gap-1">
    <h3 className="text-sm font-semibold">{FLOW.read.meet}</h3>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {[
        ...week.sla.map(({ id, what, target }) => ({
          id,
          text: `${what}: ${target}`,
        })),
        ...ticket.figures,
      ].map(({ id, text }) => (
        <div key={id} className="contents">
          <dt className="text-muted-foreground font-mono text-xs leading-5">
            {id}
          </dt>
          <dd className="[overflow-wrap:anywhere]">
            <Ticked text={text} />
          </dd>
        </div>
      ))}
    </dl>
  </section>
)

/** Each fork as the agent lists it: read, not picked (C695). */
const Forks = ({ ticket }: { ticket: Ticket }): JSX.Element => (
  <section className="flex flex-col gap-3">
    <h3 className="text-sm font-semibold">{FLOW.read.forks}</h3>
    {ticket.forks.map((fork, i) => (
      <article
        key={fork.question}
        className="bg-card flex flex-col gap-2 rounded-2xl p-3"
      >
        <p className="text-muted-foreground text-xs font-semibold">
          {FLOW.read.forkOf(i + 1, ticket.forks.length)}
        </p>
        <p className="font-semibold [overflow-wrap:anywhere]">
          <Ticked text={fork.question} />
        </p>
        <p className="text-muted-foreground text-xs">
          {FLOW.read.notAll(fork.options.length)}
        </p>
        <ol className="flex flex-col gap-2">
          {fork.options.map((option) => (
            <li
              key={option.id}
              className="border-border flex flex-col gap-0.5 border-t pt-2 text-sm"
            >
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-extrabold">{option.id}</span>
                {option.recommended && (
                  <span className="text-xs font-bold tracking-wide uppercase">
                    {FLOW.read.recommended}
                  </span>
                )}
                <span>
                  <span className="sr-only">{FLOW.read.cites} </span>
                  <Ids ids={option.cites} />
                </span>
              </p>
              <p className="font-semibold [overflow-wrap:anywhere]">
                <Ticked text={option.decision} />
              </p>
              <p className="[overflow-wrap:anywhere]">
                <Ticked text={option.why} />
              </p>
              <p className="text-muted-foreground text-xs">
                {FLOW.read.restsOn} <Ticked text={option.model.name} />
              </p>
            </li>
          ))}
        </ol>
      </article>
    ))}
  </section>
)

const ReadPage = ({
  held,
  ticket,
  flow,
}: {
  held: HeldWeek
  ticket: Ticket
  flow: FlowRuntime
}): JSX.Element => {
  const run = held.runs[ticket.id] ?? null
  const span =
    run?.outcome === "compile-error" && run.span !== null
      ? [run.span]
      : undefined
  const forks = ticket.forks.some((fork) => fork.options.length > 0)
  const academy = ticket.academy.length > 0
  return (
    <>
      <p>{ticket.spec}</p>
      <Constraints week={held.week} ticket={ticket} />
      <CodeCard
        code={ticket.program}
        label={ticket.id}
        spans={span}
        appearance="code"
      />
      <RunView
        run={run}
        program={ticket.program}
        appearance="code"
        none={held.ended.includes(ticket.id) ? WORDS.noRun : WORDS.noRunYet}
        silent={WORDS.rustcSilent}
      />
      {forks ? (
        <Forks ticket={ticket} />
      ) : (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{WORDS.speakTo}</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {ticket.forks.map(({ question }) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </section>
      )}
      <Button
        size="lg"
        onClick={() => flow.dispatch({ type: "leave", how: "onward" })}
      >
        {academy
          ? FLOW.read.toAcademy
          : forks
            ? FLOW.read.toDecisions
            : FLOW.read.toVoice}
      </Button>
      {academy && (
        <Button
          variant="outline"
          onClick={() => flow.dispatch({ type: "leave", how: "toVoice" })}
        >
          {FLOW.read.skip}
        </Button>
      )}
    </>
  )
}

const AcademyPage = ({
  ticket,
  flow,
  view,
}: {
  ticket: Ticket
  flow: FlowRuntime
  view: FlowState
}): JSX.Element => {
  const done = ticked(view.ticks, ticket.id)
  return (
    <>
      <p>{FLOW.academy.line}</p>
      <ol className="flex flex-col gap-2">
        {ticket.academy.map((exercise, i) => (
          <li key={exercise.title}>
            <CardLink asChild>
              <button
                type="button"
                onClick={() => flow.dispatch({ type: "exercise", n: i + 1 })}
              >
                <CardLinkBody className="gap-1">
                  <span className="text-muted-foreground text-xs font-semibold">
                    {FLOW.academy.head(i + 1, forksOf(exercise))}
                  </span>
                  <span className="font-semibold">
                    <Ticked text={exercise.title} />
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {FLOW.academy.tests(testsOf(exercise))}
                  </span>
                  <Keywords words={exercise.keywords} />
                  <span className="text-xs font-semibold">
                    {done.has(i + 1)
                      ? FLOW.academy.atDesk
                      : FLOW.academy.notYet}
                  </span>
                </CardLinkBody>
              </button>
            </CardLink>
          </li>
        ))}
      </ol>
      <Button
        size="lg"
        variant={done.size > 0 ? "default" : "outline"}
        onClick={() => flow.dispatch({ type: "leave", how: "onward" })}
      >
        {done.size > 0 ? FLOW.academy.onward : FLOW.academy.skip}
      </Button>
    </>
  )
}

/** One exercise, open: worked at the desk, never answered here. */
const ExercisePage = ({
  ticket,
  n,
  flow,
  view,
}: {
  ticket: Ticket
  n: number
  flow: FlowRuntime
  view: FlowState
}): JSX.Element | null => {
  const exercise = ticket.academy[n - 1]
  if (exercise === undefined) return null
  const done = ticked(view.ticks, ticket.id).has(n)
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => flow.dispatch({ type: "exercise", n: null })}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {FLOW.exercise.back}
      </Button>
      <p className="text-muted-foreground text-xs font-semibold">
        {[
          FLOW.exercise.head(ticket.id, n, ticket.academy.length),
          FLOW.exercise.toward(forksOf(exercise)),
        ].join(FLOW.dot)}
      </p>
      <h3 className="text-xl font-extrabold text-balance">
        <Ticked text={exercise.title} />
      </h3>
      {exercise.tests.map(({ fork, option }) => {
        const listed = ticket.forks[fork - 1]?.options.find(
          (each) => each.id === option
        )
        return (
          <section
            key={`${fork}${option}`}
            className="bg-card flex flex-col gap-0.5 rounded-2xl p-3 text-sm"
          >
            <p className="text-muted-foreground text-xs font-semibold">
              {FLOW.exercise.tests(fork, option)}
            </p>
            {listed !== undefined && (
              <>
                <p className="font-semibold">
                  <Ticked text={listed.model.name} />
                </p>
                <p className="text-muted-foreground">
                  <Ticked text={listed.decision} />
                </p>
              </>
            )}
          </section>
        )
      })}
      <p>
        <Ticked text={exercise.why} />
      </p>
      <section className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold">{FLOW.exercise.words}</h4>
        <Keywords words={exercise.keywords} />
      </section>
      <CodeCard code={exercise.starter} label="main.rs" appearance="code" />
      <section className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold">{FLOW.exercise.then}</h4>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {exercise.tries.map((step) => (
            <li key={step}>
              <Ticked text={step} />
            </li>
          ))}
        </ol>
      </section>
      <section className="flex flex-col gap-1">
        <h4 className="text-sm font-semibold">{FLOW.exercise.clarity}</h4>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {exercise.clarity.map((question) => (
            <li key={question}>
              <Ticked text={question} />
            </li>
          ))}
        </ul>
      </section>
      <Button
        size="lg"
        variant={done ? "outline" : "default"}
        disabled={done}
        onClick={() => flow.dispatch({ type: "tick", n })}
      >
        {done ? FLOW.exercise.ticked : FLOW.exercise.tick}
      </Button>
    </>
  )
}

/** A fork's pick, at the head of its open point (`PointTakes`' `pointHead`). */
function forkPickAt(
  ticket: Ticket,
  view: FlowState,
  flow: FlowRuntime
): (n: number) => ReactNode {
  return function forkPick(n: number): ReactNode {
    const fork = ticket.forks[n - 1]
    if (fork === undefined || fork.options.length === 0) return null
    return (
      <DecisionPick
        options={fork.options.map((option) => ({
          ...option,
          decision: <Ticked text={option.decision} />,
        }))}
        picked={currentPick(view.picks, ticket.id, n)}
        onPick={(pick) => flow.dispatch({ type: "pick", fork: n, pick })}
        words={{
          label: fork.question,
          recommended: FLOW.voice.recommended,
          own: FLOW.voice.own,
          none: FLOW.voice.none,
        }}
      />
    )
  }
}

const VoicePage = (
  props: FlowPagesProps & { ticket: Ticket; view: FlowState; last: boolean }
): JSX.Element => {
  const { machine, state, ticket, flow, view } = props
  const forks = ticket.forks.some((fork) => fork.options.length > 0)
  const recording = pointRecording(state)
  const said = (n: number): boolean =>
    machine.answered(state, pointItem(ticket.id, n)) === "said"
  const summary = (n: number): string | null => {
    const fork = ticket.forks[n - 1]
    if (fork === undefined || fork.options.length === 0) return null
    const picked = currentPick(view.picks, ticket.id, n)
    const recommended = fork.options.find((each) => each.recommended)?.id ?? ""
    const head =
      picked === null
        ? FLOW.voice.byDefault(recommended)
        : picked.kind === "own"
          ? FLOW.voice.ownPick
          : FLOW.voice.pick(picked.option)
    return [head, said(n) ? FLOW.voice.said : FLOW.voice.notSaid].join(FLOW.dot)
  }
  const mine = ticket.forks.filter(
    (fork, i) =>
      fork.options.length > 0 &&
      currentPick(view.picks, ticket.id, i + 1) !== null
  ).length
  const withOptions = ticket.forks.filter((fork) => fork.options.length > 0)
  const next =
    props.held.week.tickets[
      props.held.week.tickets.findIndex(({ id }) => id === ticket.id) + 1
    ]
  return (
    <>
      {forks && !recording && <p>{FLOW.voice.line}</p>}
      <PointTakes
        key={ticket.id}
        {...props}
        ticket={ticket}
        {...(forks
          ? {
              heading: FLOW.voice.heading,
              pointSummary: summary,
              pointHead: forkPickAt(ticket, view, flow),
            }
          : {})}
      />
      {forks && !recording && (
        <p className="text-muted-foreground text-xs">
          {FLOW.voice.mine(mine, withOptions.length)}
        </p>
      )}
      {!recording && (
        <>
          <Button
            size="lg"
            variant="outline"
            onClick={() => flow.dispatch({ type: "review" })}
          >
            {WORDS.toReview}
          </Button>
          {!props.last && next !== undefined && (
            <Button
              variant="ghost"
              onClick={() => flow.dispatch({ type: "leave", how: "onward" })}
            >
              {FLOW.voice.next(next.id)}
            </Button>
          )}
        </>
      )}
    </>
  )
}

/** The step row: where the ticket's steps stand, each a way to it. */
const StepRow = ({
  steps,
  view,
  ticket,
  flow,
}: {
  steps: ReadonlyArray<FlowStep>
  view: FlowState
  ticket: Ticket
  flow: FlowRuntime
}): JSX.Element => (
  <nav aria-label={FLOW.stepsOf(ticket.id)} className="flex gap-1.5">
    {steps.flatMap((step, index) => {
      if (step.ticket !== ticket.id) return []
      const standing = stepStanding(view.marks, step)
      // A step worked through is ticked beside its name ("Read ✓", C711);
      // the line below says the academy's count, or a step skipped.
      const line =
        step.step === "academy" && standing !== "skipped"
          ? FLOW.atDesk(
              ticked(view.ticks, ticket.id).size,
              ticket.academy.length
            )
          : standing === "skipped"
            ? FLOW.standing.skipped
            : ""
      return [
        <button
          key={step.step}
          type="button"
          aria-current={index === view.at ? "step" : undefined}
          onClick={() => flow.dispatch({ type: "go", index })}
          className={cn(
            "flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center overflow-hidden rounded-xl border px-2 py-1 text-left",
            index === view.at
              ? "border-brand bg-brand/10"
              : "border-border bg-card"
          )}
        >
          <span className="text-sm font-semibold">
            {FLOW.steps[step.step]}
            {standing === "done" && (
              <>
                <span aria-hidden="true"> {FLOW.standing.done}</span>
                <span className="sr-only">, {FLOW.doneSaid}</span>
              </>
            )}
          </span>
          {line !== "" && (
            <span className="text-muted-foreground w-full truncate text-xs">
              {line}
            </span>
          )}
        </button>,
      ]
    })}
  </nav>
)

export const FlowPages = (props: FlowPagesProps): JSX.Element | null => {
  const { state, held, flow } = props
  const view = useSyncExternalStore(flow.subscribe, flow.getSnapshot)
  const { steps, at } = view
  const recording = pointRecording(state)
  const go = (index: number): void => flow.dispatch({ type: "go", index })
  const { attach } = usePager({
    canPrev: at > 0,
    canNext: at < steps.length - 1,
    // Nothing turns while a take records, or while an exercise is open.
    held: state.busy || view.exercise !== null,
    onPage: (to) => go(to === "next" ? at + 1 : at - 1),
  })
  const step = steps[at]
  const { tickets } = held.week
  const n = tickets.findIndex(({ id }) => id === step?.ticket)
  const ticket = tickets[n]
  if (step === undefined || ticket === undefined) return null
  return (
    <div className="flex flex-col gap-3">
      {!recording && (
        <header className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-semibold">
            {WORDS.ticketOf(ticket.id, n + 1, tickets.length)}
          </p>
          <h2 className="text-2xl font-extrabold text-balance">
            {ticket.title}
          </h2>
          <StepRow steps={steps} view={view} ticket={ticket} flow={flow} />
          {/* The tracker counts toward what this step shows (RR26, C679). */}
          <Tracker
            week={held.week}
            ticket={ticket}
            step={step.step}
            exercise={step.step === "academy" ? view.exercise : null}
          />
        </header>
      )}
      <section
        ref={attach}
        data-swipe="flow"
        data-flow-step={step.step}
        aria-label={`${ticket.id} · ${FLOW.steps[step.step]}`}
        className="flex min-w-0 flex-col gap-3"
      >
        {step.step === "read" && (
          <ReadPage held={held} ticket={ticket} flow={flow} />
        )}
        {step.step === "academy" &&
          (view.exercise === null ? (
            <AcademyPage ticket={ticket} flow={flow} view={view} />
          ) : (
            <ExercisePage
              ticket={ticket}
              n={view.exercise}
              flow={flow}
              view={view}
            />
          ))}
        {step.step === "voice" && (
          <VoicePage
            {...props}
            ticket={ticket}
            view={view}
            last={n === tickets.length - 1}
          />
        )}
      </section>
      {!recording && view.exercise === null && (
        <PageControls
          page={at}
          pageCount={steps.length}
          onPrevious={() => go(at - 1)}
          onNext={() => go(at + 1)}
          label={FLOW.paged}
        />
      )}
    </div>
  )
}
