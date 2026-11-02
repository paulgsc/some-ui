/**
 * A new idea as one bundle (STUDIO ST26, #2453): what it is, then its
 * questions, one card each, swiped between with the thumb, each answer said
 * and heard back on the take pattern's parts, then the whole idea looked
 * over and sent together. Renders `lib/idea/bundle.ts`'s state and forwards
 * taps; its words are Studio's (`bundle`), and the take's are the pattern's.
 *
 * The swipe is a pointer gesture on the cards: its travel is held here while
 * the finger is down, and what a release means is `swipeOf`'s. vitest's
 * pointer events don't reproduce a phone's touch (CK7, #2386).
 */
import type { JSX, MouseEvent, PointerEvent, ReactNode } from "react"
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { assertNever, cn } from "@some-ui/core-utils"
import {
  Button,
  ConfirmSheet,
  TakeItem,
  TakeRows,
  useTakePattern,
} from "@some-ui/shared"
import type { TakePatternSnapshot } from "@some-ui/voice-capture"
import { takeItemView } from "@some-ui/voice-capture"
import type {
  BundleIntent,
  BundleNotice,
  BundleState,
} from "@soundbites/lib/idea/bundle"
import {
  answered,
  answeredCount,
  cardView,
  missing,
  swipeOf,
} from "@soundbites/lib/idea/bundle"
import type {
  BundlePorts,
  BundleTakes,
} from "@soundbites/lib/idea/bundle-runtime"
import { createIdeaBundle } from "@soundbites/lib/idea/bundle-runtime"
import { answersOf } from "@soundbites/lib/idea/draft"
import type { QuestionId } from "@soundbites/lib/idea/model"
import {
  IDEA_FORMATS,
  IDEA_QUESTIONS,
  isRequired,
  TITLE_MAX,
  TYPED_MAX,
} from "@soundbites/lib/idea/model"
import { phoneBundlePorts } from "@soundbites/lib/phone"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { ChevronLeft, Keyboard, MicOff } from "lucide-react"

const WORDS = STUDIO_WORDS.bundle
const ASK = STUDIO_WORDS.idea.questions

export type IdeaBundleProps = {
  /** The phone's desk of idea takes, as a new idea uses it. Read once. */
  takes: BundleTakes
  /** The phone's other ports unless a test says otherwise. Read once. */
  ports?: Partial<Omit<BundlePorts, "takes">>
  /** The way back to Studio, from the first screen. */
  back?: ReactNode
}

type Dispatch = (intent: BundleIntent) => void

function noticeSaid(notice: BundleNotice | null): string | null {
  return notice === null ? null : WORDS.notice[notice]
}

const Notice = ({ notice }: { notice: BundleNotice | null }): JSX.Element => (
  <p aria-live="polite" className="text-muted-foreground min-h-5 text-sm">
    {noticeSaid(notice)}
  </p>
)

const Chip = ({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element => (
  <Button
    type="button"
    size="sm"
    variant={on ? "default" : "outline"}
    aria-pressed={on}
    className="rounded-full"
    onClick={onClick}
  >
    {children}
  </Button>
)

const About = ({
  state,
  dispatch,
}: {
  state: BundleState
  dispatch: Dispatch
}): JSX.Element => {
  const titleId = useId()
  const { about } = state.draft
  const left = TITLE_MAX - about.title.length
  return (
    <div className="flex flex-col gap-5">
      <header className="space-y-1">
        <h2 className="text-3xl font-extrabold">{WORDS.about.heading}</h2>
        <p className="text-muted-foreground text-sm">
          {WORDS.about.dated(state.draft.at)}
        </p>
      </header>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">
          {WORDS.about.madeFor}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {IDEA_FORMATS.map((format) => (
            <Button
              key={format}
              type="button"
              variant={about.format === format ? "default" : "outline"}
              aria-pressed={about.format === format}
              className="h-16 rounded-2xl"
              onClick={() => dispatch({ type: "format", format })}
            >
              {WORDS.about.formats[format]}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <label htmlFor={titleId} className="text-sm font-semibold">
          {WORDS.about.title}
        </label>
        <input
          id={titleId}
          value={about.title}
          maxLength={TITLE_MAX}
          placeholder={WORDS.about.titleHint}
          onChange={(event) =>
            dispatch({ type: "title", text: event.currentTarget.value })
          }
          className="bg-background border-border focus-visible:ring-ring h-12 rounded-2xl border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
        />
        <p className="text-muted-foreground text-xs">
          {WORDS.about.titleLeft(left)}
        </p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">
          {WORDS.about.topic}
        </legend>
        <div className="flex flex-wrap gap-2">
          {state.lists.topics.map((topic) => (
            <Chip
              key={topic}
              on={about.topic === topic}
              onClick={() => dispatch({ type: "topic", topic })}
            >
              {topic}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">
          {WORDS.about.keywords}{" "}
          <span className="text-muted-foreground font-normal">
            · {WORDS.about.pickAny}
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {state.lists.keywords.map((keyword) => (
            <Chip
              key={keyword}
              on={about.keywords.includes(keyword)}
              onClick={() => dispatch({ type: "keyword", keyword })}
            >
              {keyword}
            </Chip>
          ))}
        </div>
      </fieldset>
      <Button size="lg" onClick={() => dispatch({ type: "start" })}>
        {WORDS.about.start}
      </Button>
    </div>
  )
}

/** A dot's label: how its question stands. */
function dotLabel(state: BundleState, question: QuestionId, n: number): string {
  const mode = state.modes[question]
  if (mode?.kind === "failed") {
    return mode.full ? WORDS.dot.full(n) : WORDS.dot.failed(n)
  }
  const how = answered(state, question)
  if (how !== null) return WORDS.dot[how](n)
  return state.draft.later.includes(question)
    ? WORDS.dot.later(n)
    : WORDS.dot.open(n)
}

/**
 * Nothing was kept for a card. Voice didn't come through, so it can be said
 * again; or (`full`) the phone has no room for another take until home has
 * the ones it holds, so saying it again would fail the same way.
 */
const Failed = ({
  question,
  full,
  dispatch,
}: {
  question: QuestionId
  full: boolean
  dispatch: Dispatch
}): JSX.Element => (
  <div className="flex flex-col gap-3">
    <div
      role="status"
      className="border-destructive/40 bg-destructive/10 flex gap-3 rounded-2xl border p-4"
    >
      <MicOff className="mt-1 size-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-bold">
          {full ? WORDS.full.title : WORDS.failed.title}
        </p>
        <p className="text-muted-foreground text-sm">
          {full ? WORDS.full.line : WORDS.failed.line}
        </p>
      </div>
    </div>
    {!full && (
      <Button size="lg" onClick={() => dispatch({ type: "tap", question })}>
        {WORDS.failed.again}
      </Button>
    )}
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        onClick={() => dispatch({ type: "later", question })}
      >
        {WORDS.failed.later}
      </Button>
      <Button
        variant="outline"
        className="border-dashed"
        onClick={() => dispatch({ type: "typeInstead", question })}
      >
        {WORDS.failed.type}
      </Button>
    </div>
  </div>
)

const Typing = ({
  question,
  text,
  dispatch,
}: {
  question: QuestionId
  text: string
  dispatch: Dispatch
}): JSX.Element => {
  const id = useId()
  return (
    <div
      data-typing="fallback"
      className="border-border flex flex-col gap-2 rounded-2xl border-2 border-dashed p-3"
    >
      <p className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase">
        <Keyboard className="size-4" aria-hidden="true" />
        {WORDS.typing.mark}
      </p>
      <label htmlFor={id} className="text-muted-foreground text-sm">
        {WORDS.typing.hint}
      </label>
      <textarea
        id={id}
        value={text}
        rows={3}
        maxLength={TYPED_MAX}
        onChange={(event) =>
          dispatch({ type: "typed", question, text: event.currentTarget.value })
        }
        className="bg-background border-border focus-visible:ring-ring rounded-xl border p-3 text-base focus-visible:ring-2 focus-visible:outline-none"
      />
      <p className="text-muted-foreground text-xs">
        {WORDS.typing.left(TYPED_MAX - text.length)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => dispatch({ type: "tap", question })}
        >
          {WORDS.typing.voice}
        </Button>
        <Button
          disabled={text.trim() === ""}
          onClick={() => dispatch({ type: "keepTyped", question })}
        >
          {WORDS.typing.keep}
        </Button>
      </div>
    </div>
  )
}

const Typed = ({
  question,
  words,
  dispatch,
}: {
  question: QuestionId
  words: string
  dispatch: Dispatch
}): JSX.Element => (
  <div className="flex flex-col gap-2">
    <div
      data-typing="kept"
      className="border-border flex flex-col gap-1 rounded-2xl border-2 border-dashed p-3"
    >
      <p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
        {WORDS.typed.mark}
      </p>
      <p className="text-base">{words}</p>
    </div>
    <Button size="lg" onClick={() => dispatch({ type: "tap", question })}>
      {WORDS.typed.sayInstead}
    </Button>
  </div>
)

const Card = ({
  state,
  question,
  n,
  takes,
  snapshot,
  active,
  offset,
  dispatch,
}: {
  state: BundleState
  question: QuestionId
  n: number
  takes: BundleTakes
  snapshot: TakePatternSnapshot
  active: boolean
  /** Where it sits beside the card on screen, and the finger's travel. */
  offset: {
    readonly cards: number
    readonly px: number
    readonly easing: boolean
  }
  dispatch: Dispatch
}): JSX.Element => {
  const answers = answersOf(state.draft.id, question)
  const recording =
    snapshot.take.kind !== "idle" && snapshot.answers === answers
  const card = cardView(state, question, recording)
  const of = IDEA_QUESTIONS.length
  const view = takeItemView(
    snapshot,
    state.takes,
    answers,
    takes.pattern.options
  )
  return (
    <section
      aria-label={WORDS.questionOf(n, of)}
      aria-hidden={!active}
      inert={!active}
      data-card={question}
      className={cn(
        "col-start-1 row-start-1 flex min-w-0 flex-col gap-3 px-1",
        offset.easing && "transition-transform duration-200 ease-out"
      )}
      style={{
        transform: `translateX(calc(${offset.cards * 100}% + ${offset.px}px))`,
      }}
    >
      <p className="text-muted-foreground text-xs font-semibold">
        {WORDS.questionOf(n, of)}
        {isRequired(question) ? "" : ` · ${WORDS.canWait}`}
      </p>
      <h2 className="text-3xl font-extrabold text-balance">
        {ASK[question].ask}
      </h2>
      <p className="text-muted-foreground">{ASK[question].hint}</p>
      {card.kind === "failed" && (
        <Failed question={question} full={card.full} dispatch={dispatch} />
      )}
      {card.kind === "typing" && (
        <Typing question={question} text={card.text} dispatch={dispatch} />
      )}
      {card.kind === "typed" && (
        <Typed question={question} words={card.words} dispatch={dispatch} />
      )}
      {card.kind === "later" && (
        <div className="flex flex-col gap-2">
          <p className="bg-card rounded-2xl p-3 text-sm">{WORDS.later.line}</p>
          <Button size="lg" onClick={() => dispatch({ type: "tap", question })}>
            {WORDS.later.sayNow}
          </Button>
        </div>
      )}
      {card.kind === "take" && (
        <>
          <TakeItem
            view={view}
            size="large"
            onTap={() => dispatch({ type: "tap", question })}
            onPlay={(take) => dispatch({ type: "play", take })}
            onRedo={() => dispatch({ type: "tap", question })}
            onLetGo={() => dispatch({ type: "askDelete", question })}
          />
          {view.current.length === 0 && !recording && (
            <p className="text-muted-foreground text-center text-sm">
              {isRequired(question) ? WORDS.needed : WORDS.swipeOn}
            </p>
          )}
        </>
      )}
      <p className="text-muted-foreground flex justify-between text-xs">
        <span>{n > 1 ? WORDS.prev(n - 1) : ""}</span>
        <span>{n < of ? WORDS.next(n + 1) : WORDS.last}</span>
      </p>
    </section>
  )
}

const Questions = ({
  state,
  takes,
  snapshot,
  dispatch,
}: {
  state: BundleState
  takes: BundleTakes
  snapshot: TakePatternSnapshot
  dispatch: Dispatch
}): JSX.Element => {
  // The finger's travel while it is down: the gesture's own, not the idea's.
  const [drag, setDrag] = useState<{ x: number; dx: number } | null>(null)
  // A swipe that began on a button ends in that button's click: it is
  // swallowed, so a swipe never also starts a take. Cleared by the next
  // touch, so a swipe that ended off any button holds back nothing.
  const swiped = useRef(false)
  const down = (event: PointerEvent): void => {
    swiped.current = false
    if (state.busy) return
    setDrag({ x: event.clientX, dx: 0 })
  }
  const move = (event: PointerEvent): void => {
    if (drag !== null) setDrag({ ...drag, dx: event.clientX - drag.x })
  }
  const up = (): void => {
    if (drag === null) return
    const to = swipeOf(drag.dx)
    setDrag(null)
    if (to === null) return
    swiped.current = true
    dispatch({ type: "swipe", to })
  }
  const click = (event: MouseEvent): void => {
    if (!swiped.current) return
    swiped.current = false
    event.preventDefault()
    event.stopPropagation()
  }
  const dx = drag?.dx ?? 0
  return (
    <div className="flex flex-col gap-3">
      <nav className="flex items-center justify-center gap-1">
        {IDEA_QUESTIONS.map((question, i) => {
          const how = answered(state, question)
          const failed = state.modes[question]?.kind === "failed"
          return (
            <button
              key={question}
              type="button"
              aria-label={dotLabel(state, question, i + 1)}
              aria-current={i === state.index ? "step" : undefined}
              disabled={state.busy}
              onClick={() => dispatch({ type: "go", index: i })}
              className="flex h-7 w-11 items-center justify-center"
            >
              <span
                data-dot={how ?? (failed ? "failed" : "open")}
                className={cn(
                  "h-2.5 rounded-full border-2",
                  i === state.index ? "w-6" : "w-2.5",
                  how === "said"
                    ? "bg-brand border-brand"
                    : how === "typed"
                      ? "bg-muted-foreground border-muted-foreground border-dashed"
                      : failed
                        ? "border-destructive"
                        : "border-muted-foreground/60"
                )}
              />
            </button>
          )
        })}
      </nav>
      <div
        data-swipe="cards"
        className="touch-pan-y"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
        onClickCapture={click}
      >
        {/* The cards share one cell, each moved sideways by its distance
            from the card on screen, so the row clips them and none of them
            is wider than the phone. */}
        <div className="grid overflow-hidden">
          {IDEA_QUESTIONS.map((question, i) => (
            <Card
              key={question}
              state={state}
              question={question}
              n={i + 1}
              takes={takes}
              snapshot={snapshot}
              active={i === state.index}
              offset={{
                cards: i - state.index,
                px: dx,
                easing: drag === null,
              }}
              dispatch={dispatch}
            />
          ))}
        </div>
      </div>
      <Notice notice={state.notice} />
      <p className="text-muted-foreground text-center text-xs">
        {WORDS.saidCount(answeredCount(state), IDEA_QUESTIONS.length)}
      </p>
      <Button
        variant="outline"
        size="lg"
        disabled={state.busy}
        onClick={() => dispatch({ type: "review" })}
      >
        {WORDS.toReview}
      </Button>
    </div>
  )
}

const Review = ({
  state,
  takes,
  snapshot,
  dispatch,
}: {
  state: BundleState
  takes: BundleTakes
  snapshot: TakePatternSnapshot
  dispatch: Dispatch
}): JSX.Element => {
  const { about } = state.draft
  const needs = missing(state)
  const n = answeredCount(state)
  const near = state.reach === "near"
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-2">
        <h2 className="text-2xl font-extrabold">
          {about.title.trim() === "" ? WORDS.review.noTitle : about.title}
        </h2>
        <ul className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {[
            WORDS.about.formats[about.format],
            ...(about.topic === null ? [] : [about.topic]),
            ...about.keywords,
          ].map((chip) => (
            <li key={chip} className="bg-muted rounded-full px-2.5 py-1">
              {chip}
            </li>
          ))}
          <li>
            <Button
              variant="link"
              size="sm"
              onClick={() => dispatch({ type: "change" })}
            >
              {WORDS.review.change}
            </Button>
          </li>
        </ul>
        <p className="text-muted-foreground text-sm">{WORDS.review.kept}</p>
      </header>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          disabled={!IDEA_QUESTIONS.some((q) => answered(state, q) === "said")}
          onClick={() => dispatch({ type: "playAll" })}
        >
          {state.playAll === null ? WORDS.review.playAll : WORDS.review.stopAll}
        </Button>
        <Button
          variant="secondary"
          className="text-destructive"
          onClick={() => dispatch({ type: "askDeleteAll" })}
        >
          {WORDS.review.deleteAll}
        </Button>
      </div>
      <ol className="flex flex-col gap-3">
        {IDEA_QUESTIONS.map((question) => {
          const how = answered(state, question)
          const typed = state.draft.typed[question]
          return (
            <li key={question} className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{ASK[question].ask}</p>
              {how === "said" && (
                <TakeRows
                  view={takeItemView(
                    snapshot,
                    state.takes,
                    answersOf(state.draft.id, question),
                    takes.pattern.options
                  )}
                  onPlay={(take) => dispatch({ type: "play", take })}
                  onRedo={() => dispatch({ type: "tap", question })}
                  onLetGo={() => dispatch({ type: "askDelete", question })}
                />
              )}
              {how === "typed" && typed !== undefined && (
                <div className="border-border flex flex-col gap-2 rounded-2xl border-2 border-dashed p-3">
                  <p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                    {WORDS.review.typed}
                  </p>
                  <p>{typed}</p>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dispatch({ type: "tap", question })}
                    >
                      {WORDS.typed.sayInstead}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => dispatch({ type: "askDelete", question })}
                    >
                      {WORDS.review.delete}
                    </Button>
                  </div>
                </div>
              )}
              {how === null && (
                <div className="bg-card flex items-center justify-between rounded-2xl p-3">
                  <span className="text-muted-foreground text-sm">
                    {WORDS.review.notSaid}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => dispatch({ type: "tap", question })}
                  >
                    {WORDS.review.sayIt}
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <Notice notice={state.notice} />
      {needs !== null && (
        <p role="status" className="text-center text-sm font-semibold">
          {needs === "title"
            ? WORDS.review.needsTitle
            : WORDS.review.needsFirst}
        </p>
      )}
      {!near && (
        <p className="text-muted-foreground text-center text-sm">
          {WORDS.review.away}
        </p>
      )}
      <Button
        size="lg"
        disabled={needs !== null}
        onClick={() => dispatch({ type: "send" })}
      >
        {near ? WORDS.review.send(n) : WORDS.review.keep(n)}
      </Button>
    </div>
  )
}

const Sent = ({
  state,
  dispatch,
  back,
}: {
  state: BundleState
  dispatch: Dispatch
  back: ReactNode
}): JSX.Element => {
  const about = state.sent?.about
  const near = state.reach === "near"
  return (
    <div className="flex flex-col gap-3">
      <h2 aria-live="polite" className="text-3xl font-extrabold">
        {near ? WORDS.sent.title : WORDS.sent.kept}
      </h2>
      <p className="text-muted-foreground">
        {near ? WORDS.sent.near : WORDS.sent.away}
      </p>
      {about !== undefined && (
        <div className="bg-card rounded-2xl p-4">
          <p className="font-semibold">{about.title}</p>
          <p className="text-muted-foreground text-sm">
            {[WORDS.about.formats[about.format], about.topic]
              .filter((part) => part !== null)
              .join(" · ")}
          </p>
        </div>
      )}
      <Button size="lg" onClick={() => dispatch({ type: "another" })}>
        {WORDS.sent.another}
      </Button>
      {back}
    </div>
  )
}

function confirmOf(
  state: BundleState,
  dispatch: Dispatch
): Parameters<typeof ConfirmSheet>[0]["request"] {
  const { confirm } = state
  if (confirm === null) return null
  const onConfirm = (): void => dispatch({ type: "confirmed" })
  return confirm.kind === "all"
    ? {
        title: WORDS.confirm.allTitle,
        description: WORDS.confirm.allLine,
        confirm: WORDS.confirm.yes,
        keep: WORDS.confirm.keep,
        onConfirm,
      }
    : {
        title: WORDS.confirm.answerTitle,
        description: WORDS.confirm.answerLine(ASK[confirm.question].ask),
        confirm: WORDS.confirm.yes,
        keep: WORDS.confirm.keep,
        onConfirm,
      }
}

const Screen = ({
  state,
  takes,
  snapshot,
  dispatch,
  back,
}: {
  state: BundleState
  takes: BundleTakes
  snapshot: TakePatternSnapshot
  dispatch: Dispatch
  back: ReactNode
}): JSX.Element => {
  switch (state.screen) {
    case "loading": {
      return <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
    }
    case "unreadable": {
      return (
        <div role="alert" className="space-y-2 text-sm">
          <p>{WORDS.unreadable}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => dispatch({ type: "readAgain" })}
          >
            {WORDS.readAgain}
          </Button>
          {back}
        </div>
      )
    }
    case "about": {
      return (
        <>
          <About state={state} dispatch={dispatch} />
          <Notice notice={state.notice} />
          {back}
        </>
      )
    }
    case "questions": {
      return (
        <Questions
          state={state}
          takes={takes}
          snapshot={snapshot}
          dispatch={dispatch}
        />
      )
    }
    case "review": {
      return (
        <Review
          state={state}
          takes={takes}
          snapshot={snapshot}
          dispatch={dispatch}
        />
      )
    }
    case "sent": {
      return <Sent state={state} dispatch={dispatch} back={back} />
    }
    default: {
      return assertNever(state.screen)
    }
  }
}

export const IdeaBundle = ({
  takes,
  ports,
  back,
}: IdeaBundleProps): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime, and the takes it runs on, are taken once per mount, as the idea capture's are */
  const [{ runtime, desk }] = useState(() => ({
    runtime: createIdeaBundle({ ...phoneBundlePorts(), ...ports, takes }),
    desk: takes,
  }))
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => runtime.attach(), [runtime])
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const snapshot = useTakePattern(desk.pattern)
  const { dispatch } = runtime
  const backable =
    !state.busy && (state.screen === "questions" || state.screen === "review")
  return (
    <div className="flex flex-col gap-4">
      {backable && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => dispatch({ type: "back" })}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {WORDS.backLabel}
        </Button>
      )}
      <Screen
        state={state}
        takes={desk}
        snapshot={snapshot}
        dispatch={dispatch}
        back={back}
      />
      <ConfirmSheet
        request={confirmOf(state, dispatch)}
        open={state.confirm !== null}
        onOpenChange={(open) => {
          if (!open && state.confirm !== null) dispatch({ type: "keepIt" })
        }}
      />
    </div>
  )
}
