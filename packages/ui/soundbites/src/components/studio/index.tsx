/**
 * Studio on the phone: a video made in sittings, each screen one task
 * (STUDIO ST4). Start says where things stand and offers the sittings;
 * Record shows one scene at a time, its point in large type, and one button
 * to say it; Done for now asks how the sitting went and says where the next
 * one opens.
 *
 * Only renders and forwards taps: what happens and in what order is
 * `lib/studio/machine.ts`; the microphone, the store, `Audio` and the picked
 * file are `lib/studio/runtime.ts`; every word is `lib/studio/words.ts`
 * (docs/monorepo-boundaries.md, "Inside a React package").
 */
import type { JSX, ReactNode } from "react"
import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { LOOKS, VOICES } from "@some-ui/video-render"
import { FilePick } from "@soundbites/components/file-pick"
import { Notice } from "@soundbites/components/notice"
import { phoneStudioPorts } from "@soundbites/lib/phone"
import { finishOf } from "@soundbites/lib/project/finish"
import type { Project } from "@soundbites/lib/project/model"
import { latest } from "@soundbites/lib/project/model"
import { lengthFor } from "@soundbites/lib/project/script"
import type { StudioIntent, StudioState } from "@soundbites/lib/studio/machine"
import {
  ideasAnswering,
  isSettled,
  projectOf,
} from "@soundbites/lib/studio/machine"
import type { StudioPorts } from "@soundbites/lib/studio/runtime"
import { createStudio } from "@soundbites/lib/studio/runtime"
import { timeView } from "@soundbites/lib/studio/time-log"
import type { OriginView, RecordView } from "@soundbites/lib/studio/view"
import {
  historyView,
  opensOn,
  originView,
  othersOnPhone,
  recordView,
  startView,
  takesOnPhone,
} from "@soundbites/lib/studio/view"
import {
  askedAt,
  changesIn,
  ideaAsking,
  shotAt,
} from "@soundbites/lib/studio/watch"
import type { SittingKind, Snag, Went } from "@soundbites/lib/studio/words"
import { SITTING_KINDS, STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { Mic, Pause, Play, Square } from "lucide-react"

const WORDS = STUDIO_WORDS

export type StudioShare = (props: {
  project: Project
  /** The person says the takes that went out arrived where they sent them. */
  onArrived: (takes: ReadonlyArray<string>) => void
}) => ReactNode

export type StudioProps = {
  /** The phone's ports unless a test says otherwise. Read once, on mount. */
  ports?: Partial<StudioPorts>
  /** Sending the project to Claude, where this build can (the share sheet). */
  share?: StudioShare
  /**
   * The way to New idea (ST18), as the app links it: the one big button
   * while there is no video, a quiet link beside the sittings once there is.
   */
  newIdea?: { big: ReactNode; quiet: ReactNode }
  /**
   * The way to Your ideas (ST19), as the app links it: the loop's second
   * step while there is no video, a quiet link beside New idea once there is.
   */
  ideas?: { step: ReactNode; quiet: ReactNode }
  /**
   * The video to open on, by id (one an idea became, from Your ideas), when
   * it is on the phone; otherwise the one touched last. Read once, on mount.
   */
  initialProject?: string
}

type Dispatch = (intent: StudioIntent) => void

/** What tapping each open sitting on Start asks for. */
const CHOSEN = {
  record: "recordChosen",
  watch: "watchChosen",
  shape: "shapeChosen",
  finish: "finishChosen",
} as const satisfies Record<
  SittingKind,
  Extract<StudioIntent["type"], `${string}Chosen`>
>

/** The share slot for `project`, with "they reached Drive" told to the machine. */
function shareFor(
  share: StudioShare,
  project: Project,
  dispatch: Dispatch
): ReactNode {
  return share({
    project,
    onArrived: (takes) =>
      dispatch({ type: "takesArrived", project: project.id, takes }),
  })
}

/** The loop as steps, for a first visit. */
const Steps = ({
  newIdea,
  ideas,
}: {
  newIdea: ReactNode
  ideas: ReactNode
}): JSX.Element => {
  const { steps } = WORDS.start
  const step = (
    n: number,
    title: string,
    line: string,
    body?: ReactNode
  ): JSX.Element => (
    <li className="flex flex-col gap-2">
      <span className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
        {WORDS.start.stepOf(n)}
      </span>
      <span className="block text-base font-extrabold">{title}</span>
      <span className="text-muted-foreground block text-sm">{line}</span>
      {body}
    </li>
  )
  return (
    <ol className="flex flex-col gap-4">
      {step(1, steps.idea.title, steps.idea.line, newIdea)}
      {step(2, steps.scenes.title, steps.scenes.line, ideas)}
      {step(
        3,
        steps.sittings.title,
        steps.sittings.line,
        <ul className="flex flex-wrap gap-2" aria-label={steps.sittings.title}>
          {SITTING_KINDS.map((kind) => (
            <li
              key={kind}
              className="border-border/60 rounded-full border px-3 py-1 text-xs font-bold opacity-60"
            >
              {WORDS.start.sittings[kind]}
            </li>
          ))}
        </ul>
      )}
    </ol>
  )
}

const Start = ({
  state,
  project,
  dispatch,
  share,
  newIdea,
  ideas,
}: {
  state: StudioState
  project: Project | null
  dispatch: Dispatch
  share: StudioShare | undefined
  newIdea: StudioProps["newIdea"]
  ideas: StudioProps["ideas"]
}): JSX.Element => {
  const view = project === null ? null : startView(project)
  const others = othersOnPhone(
    state.shelf.kind === "read" ? state.shelf.projects : [],
    state.current
  )
  return (
    <div className="flex flex-col gap-3">
      <header className="space-y-1">
        <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
          {WORDS.start.eyebrow}
        </p>
        <h2 className="text-xl font-extrabold text-balance">
          {view?.title ?? WORDS.start.empty}
        </h2>
        <p className="text-muted-foreground text-sm">
          {view?.standing ?? WORDS.start.emptyLine}
        </p>
      </header>
      {view === null && <Steps newIdea={newIdea?.big} ideas={ideas?.step} />}
      {view !== null && (
        <ul className="flex flex-col gap-2">
          {view.sittings.map((row) => (
            <li key={row.kind}>
              {row.open ? (
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: CHOSEN[row.kind],
                    })
                  }
                  className="bg-card border-brand focus-visible:ring-ring flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-extrabold">
                      {WORDS.start.sittings[row.kind]}
                    </span>
                    <span className="text-muted-foreground block text-sm">
                      {row.status}
                    </span>
                  </span>
                  {row.startHere && (
                    <span className="bg-brand text-brand-foreground shrink-0 rounded-full px-2.5 py-1 text-xs font-bold">
                      {WORDS.start.startHere}
                    </span>
                  )}
                </button>
              ) : (
                <div className="border-border/60 rounded-2xl border px-4 py-2.5 opacity-70">
                  <span className="block text-sm font-bold">
                    {WORDS.start.sittings[row.kind]}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {row.status}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {view !== null && (
        <nav className="flex gap-4 text-sm">
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => dispatch({ type: "historyChosen" })}
          >
            {WORDS.quiet.history}
          </button>
          <button
            type="button"
            className="text-muted-foreground underline"
            onClick={() => dispatch({ type: "timeChosen" })}
          >
            {WORDS.quiet.time}
          </button>
          {newIdea?.quiet}
          {ideas?.quiet}
        </nav>
      )}
      {share !== undefined && project !== null && takesOnPhone(project) > 0 && (
        <div className="border-border/60 space-y-2 rounded-2xl border p-3">
          <p className="text-muted-foreground text-sm">
            {WORDS.start.shareLine}
          </p>
          {shareFor(share, project, dispatch)}
        </div>
      )}
      {others.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
            {WORDS.start.others}
          </h3>
          <ul className="flex flex-col gap-2">
            {others.map((other) => (
              <li
                key={other.id}
                className="border-border/60 flex items-center gap-3 rounded-2xl border px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {other.title}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {WORDS.start.onPhone(other.onPhone)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`${WORDS.start.open}: ${other.title}`}
                  onClick={() =>
                    dispatch({ type: "projectOpened", project: other.id })
                  }
                >
                  {WORDS.start.open}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <FilePick
        label={project === null ? WORDS.start.openSent : WORDS.start.openNewer}
        hint={
          project === null
            ? WORDS.start.openSentHint
            : WORDS.start.openNewerHint
        }
        problem={state.primerProblem}
        disabled={!isSettled(state.activity)}
        onPick={(file) => dispatch({ type: "primerPicked", file })}
      />
      {state.choosing !== null && project !== null && (
        <div
          role="alert"
          className="border-border/60 space-y-2.5 rounded-2xl border p-3 text-sm"
        >
          <p>{WORDS.start.which(startView(project).title)}</p>
          <div className="flex flex-col gap-2">
            <Button
              size="sm"
              onClick={() => dispatch({ type: "versionChosen", as: "next" })}
            >
              {WORDS.start.nextVersion(startView(project).title)}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => dispatch({ type: "versionChosen", as: "new" })}
            >
              {WORDS.start.newVideo}
            </Button>
            <Button
              size="sm"
              variant="link"
              onClick={() => dispatch({ type: "versionChosen", as: "cancel" })}
            >
              {WORDS.start.cancel}
            </Button>
          </div>
        </div>
      )}
      <Notice text={state.notice} />
    </div>
  )
}

/** The scene's length as it stands: the take and a breath once there is one. */
function lengthLine(view: RecordView, state: StudioState): string {
  const { activity } = state
  if (activity.kind === "recording")
    return WORDS.record.elapsed(activity.elapsed, activity.capMs)
  if (view.take !== null)
    return WORDS.record.runsWith(lengthFor(view.shot, view.take.durationMs))
  return WORDS.record.runs(view.shot.durationMs)
}

const Record = ({
  state,
  view,
  dispatch,
}: {
  state: StudioState
  view: RecordView
  dispatch: Dispatch
}): JSX.Element => {
  const { activity } = state
  const recording = activity.kind === "recording"
  const settled = isSettled(activity)
  const taken = view.take !== null && settled
  const playing = activity.kind === "playing" && activity.take === view.take?.id
  const keep = view.cut?.keep ?? []
  const label = recording
    ? WORDS.record.stop
    : activity.kind === "opening"
      ? WORDS.record.opening
      : activity.kind === "saving"
        ? WORDS.record.keeping
        : WORDS.record.talk
  return (
    <section
      aria-label={WORDS.record.sceneOf(view.n, view.of)}
      className="flex flex-col gap-3"
    >
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-[11px] font-bold tracking-wider uppercase">
        <span>{WORDS.record.sceneOf(view.n, view.of)}</span>
        {view.n > 1 && (
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0 text-xs normal-case"
            disabled={!settled}
            onClick={() => dispatch({ type: "previousPressed" })}
          >
            {WORDS.record.previous}
          </Button>
        )}
      </div>
      {view.cut !== null && (
        <p className="text-muted-foreground text-sm">
          {WORDS.record.onScreen(view.cut.artifact)}
        </p>
      )}
      {view.cut !== null && (
        <p className="text-brand text-xs font-bold tracking-wide uppercase">
          {view.cut.voice === "read" ? WORDS.record.read : WORDS.record.adLib}
        </p>
      )}
      <p className="text-2xl leading-snug font-extrabold text-balance">
        {view.cut?.prompt ?? view.shot.id}
      </p>
      {view.note !== null && (
        <p className="border-brand bg-brand/10 rounded-xl border-l-4 px-3 py-2 text-sm">
          <span className="font-bold">{WORDS.record.claudeNote}: </span>
          {view.note.text}
        </p>
      )}
      {keep.length > 0 && (
        <details className="border-border/60 rounded-xl border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold">
            {WORDS.record.mustStayTrue(keep.length)}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {keep.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </details>
      )}
      {taken ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "recordPressed" })}
          >
            <Mic className="size-4" aria-hidden="true" />
            {WORDS.record.again}
          </Button>
          {/* Wraps: on the narrowest phone (360px) a column is 160px, less
              than "Keep · next scene" on one line, and the last scene's
              label is longer. `whitespace-normal`, not `text-wrap`: the
              button's own `whitespace-nowrap` is a shorthand that resets
              text-wrap, and wins in the cascade. */}
          <Button
            className="h-auto min-h-10 whitespace-normal"
            onClick={() => dispatch({ type: "keepNextPressed" })}
          >
            {view.last ? WORDS.record.keepLast : WORDS.record.keepNext}
          </Button>
        </div>
      ) : (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => dispatch({ type: "recordPressed" })}
            disabled={activity.kind === "opening" || activity.kind === "saving"}
            aria-pressed={recording}
            aria-label={label}
            className={cn(
              "focus-visible:ring-ring focus-visible:ring-offset-background grid size-20 place-items-center rounded-full shadow-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60",
              recording
                ? "bg-destructive text-white"
                : "bg-brand text-brand-foreground"
            )}
          >
            {recording ? (
              <Square className="size-7" aria-hidden="true" />
            ) : (
              <Mic className="size-8" aria-hidden="true" />
            )}
          </button>
        </div>
      )}
      <p className="text-center font-mono text-sm tabular-nums">
        {lengthLine(view, state)}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-4">
        {recording && (
          <Button
            variant="link"
            size="sm"
            onClick={() => dispatch({ type: "discardPressed" })}
          >
            {WORDS.record.throwAway}
          </Button>
        )}
        {view.take?.onPhone === true && !recording && (
          <Button
            variant="link"
            size="sm"
            disabled={!settled}
            onClick={() => dispatch({ type: "playPressed" })}
          >
            {playing ? (
              <Pause className="size-3.5" aria-hidden="true" />
            ) : (
              <Play className="size-3.5" aria-hidden="true" />
            )}
            {playing ? WORDS.record.stopPlaying : WORDS.record.play}
          </Button>
        )}
      </div>
      <Notice
        text={
          state.notice !== ""
            ? state.notice
            : settled && view.take === null
              ? WORDS.record.upTo(view.capMs)
              : ""
        }
      />
      {state.blocked !== null && activity.kind === "idle" && (
        <p role="alert" className="text-destructive text-center text-sm">
          {WORDS.record.blocked(state.blocked)}
        </p>
      )}
      <Button
        variant="ghost"
        className="self-center"
        onClick={() => dispatch({ type: "doneForNowPressed" })}
      >
        {WORDS.record.doneForNow}
      </Button>
    </section>
  )
}

const SNAGS: ReadonlyArray<Snag> = ["mic", "words", "interrupted", "screen"]
const WENT: ReadonlyArray<Went> = ["smooth", "snags", "rough"]

const Done = ({
  state,
  project,
  dispatch,
  share,
}: {
  state: StudioState
  project: Project | null
  dispatch: Dispatch
  share: StudioShare | undefined
}): JSX.Element | null => {
  const [said, setSaid] = useState("")
  const sayId = useId()
  const { screen } = state
  if (screen.kind !== "done") return null
  if (screen.step === "how")
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">{WORDS.done.how}</h2>
        <div className="flex flex-col gap-2">
          {WENT.map((went) => (
            <Button
              key={went}
              variant="outline"
              size="lg"
              onClick={() => dispatch({ type: "wentChosen", went })}
            >
              {WORDS.done.went[went]}
            </Button>
          ))}
        </div>
        <Notice text={state.notice} />
      </section>
    )
  if (screen.step === "what")
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">{WORDS.done.what}</h2>
        <div className="grid grid-cols-2 gap-2">
          {SNAGS.map((snag) => (
            <Button
              key={snag}
              variant="outline"
              className="h-auto min-h-10 whitespace-normal"
              onClick={() =>
                dispatch({ type: "snagTold", text: WORDS.done.snags[snag] })
              }
            >
              {WORDS.done.snags[snag]}
            </Button>
          ))}
        </div>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            dispatch({ type: "snagTold", text: said })
          }}
        >
          <label htmlFor={sayId} className="text-sm font-semibold">
            {WORDS.done.sayIt}
          </label>
          <input
            id={sayId}
            value={said}
            onChange={(event) => setSaid(event.currentTarget.value)}
            className="border-input bg-background focus-visible:ring-ring rounded-xl border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={said.trim() === ""}
          >
            {WORDS.done.tell}
          </Button>
        </form>
      </section>
    )
  const where = project === null ? null : opensOn(project, screen.shot)
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-extrabold">
        {state.closed === "saving" ? WORDS.done.saving : WORDS.done.saved}
      </h2>
      <p className="text-muted-foreground text-sm">
        {state.closed === "failed" ? WORDS.done.notSaved : where}
      </p>
      {share !== undefined && project !== null && (
        <div className="border-border/60 space-y-2 rounded-2xl border p-3">
          <p className="text-muted-foreground text-sm">
            {WORDS.done.shareLine}
          </p>
          {shareFor(share, project, dispatch)}
        </div>
      )}
      <Button
        variant="outline"
        onClick={() => dispatch({ type: "notYetPressed" })}
      >
        {WORDS.done.notYet}
      </Button>
      <Notice text={state.notice} />
    </section>
  )
}

type ShapeScreen = Extract<StudioState["screen"], { kind: "shape" }>

/** One plan as a card: its name, and what it sets once chosen. */
const PlanCard = ({
  name,
  sets,
  chosen,
  now,
  onPick,
}: {
  name: string
  sets: string
  chosen: boolean
  now: boolean
  onPick: () => void
}): JSX.Element => (
  <button
    type="button"
    aria-pressed={chosen}
    onClick={onPick}
    className={cn(
      "focus-visible:ring-ring flex w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left focus-visible:ring-2 focus-visible:outline-none",
      chosen ? "bg-card border-brand border-2" : "border-border/60"
    )}
  >
    <span className="flex items-center gap-2">
      <span className="text-base font-extrabold">{name}</span>
      {now && (
        <span className="text-muted-foreground text-xs font-bold">
          {WORDS.shape.now}
        </span>
      )}
    </span>
    {chosen && <span className="text-muted-foreground text-sm">{sets}</span>}
  </button>
)

/**
 * Shape (STUDIO ST6): two steps, one question each, a few plans per
 * question, and only the chosen plan says what it sets.
 */
const Shape = ({
  screen,
  project,
  dispatch,
}: {
  screen: ShapeScreen
  project: Project
  dispatch: Dispatch
}): JSX.Element => {
  const kept = latest(project).cutList
  const lookStep = screen.step === "look"
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl font-extrabold text-balance">
        {lookStep ? WORDS.shape.lookQuestion : WORDS.shape.voiceQuestion}
      </h2>
      <div className="flex flex-col gap-2">
        {lookStep
          ? LOOKS.map((look) => (
              <PlanCard
                key={look}
                {...WORDS.shape.looks[look]}
                chosen={screen.look === look}
                now={kept.look === look}
                onPick={() => dispatch({ type: "lookPicked", look })}
              />
            ))
          : VOICES.map((voice) => (
              <PlanCard
                key={voice}
                {...WORDS.shape.voices[voice]}
                chosen={screen.voice === voice}
                now={kept.voice === voice}
                onPick={() => dispatch({ type: "voicePicked", voice })}
              />
            ))}
      </div>
      <Button
        size="lg"
        onClick={() => dispatch({ type: lookStep ? "shapeNext" : "shapeKept" })}
      >
        {lookStep ? WORDS.shape.next : WORDS.shape.keep}
      </Button>
      <Button variant="ghost" onClick={() => dispatch({ type: "shapeBack" })}>
        {WORDS.shape.back}
      </Button>
    </div>
  )
}

/** History (ST4's quiet link): every version of the video, newest first. */
const History = ({
  project,
  dispatch,
}: {
  project: Project
  dispatch: Dispatch
}): JSX.Element => (
  <div className="flex flex-col gap-3">
    <h2 className="text-2xl font-extrabold">{WORDS.history.heading}</h2>
    <ol className="flex flex-col gap-2">
      {historyView(project).map((row) => (
        <li
          key={row.rev}
          className="border-border/60 rounded-2xl border px-4 py-2.5"
        >
          <span className="text-muted-foreground block text-xs">
            {WORDS.history.line(row.rev, row.who)}
          </span>
          <span className="block text-sm">{row.message}</span>
        </li>
      ))}
    </ol>
    <Button variant="ghost" onClick={() => dispatch({ type: "quietBack" })}>
      {WORDS.history.back}
    </Button>
  </div>
)

/** Time spent (ST4's quiet link, from ST9's log): per screen, most first. */
const TimeSpent = ({
  log,
  project,
  dispatch,
}: {
  log: Extract<StudioState["screen"], { kind: "time" }>["log"]
  project: Project
  dispatch: Dispatch
}): JSX.Element => {
  const rows = log === null ? [] : timeView(project, log)
  const total = rows.reduce((sum, row) => sum + row.ms, 0)
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl font-extrabold">{WORDS.time.heading}</h2>
      {log !== null && rows.length === 0 && (
        <p className="text-muted-foreground text-sm">{WORDS.time.none}</p>
      )}
      {rows.length > 0 && (
        <>
          <p className="text-sm font-semibold">{WORDS.time.total(total)}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {rows.map((row) => (
              <li key={row.name} className="flex justify-between gap-3">
                <span className="min-w-0">{row.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {WORDS.time.spent(row.ms)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Button variant="ghost" onClick={() => dispatch({ type: "quietBack" })}>
        {WORDS.time.back}
      </Button>
    </div>
  )
}

type WatchScreen = Extract<StudioState["screen"], { kind: "watch" }>

/** The picked render, played from the file where it is: never copied in. */
const ReviewVideo = ({
  video,
  startMs,
  dispatch,
}: {
  video: Blob
  /** Where it starts playing once loaded: Watch's playhead then. */
  startMs: number
  dispatch: Dispatch
}): JSX.Element => {
  const url = useMemo(() => URL.createObjectURL(video), [video])
  useEffect(
    () => (): void => {
      URL.revokeObjectURL(url)
    },
    [url]
  )
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- the review render burns its subtitles into the picture (the captions burn-in); there is no separate track to give
    <video
      src={url}
      controls
      playsInline
      className="w-full rounded-2xl bg-black"
      onLoadedMetadata={(event) => {
        event.currentTarget.currentTime = startMs / 1_000
      }}
      onTimeUpdate={(event) =>
        dispatch({
          type: "playheadAt",
          ms: Math.round(event.currentTarget.currentTime * 1_000),
        })
      }
    />
  )
}

/**
 * Watch (STUDIO ST5): a review render, one button to note the moment on
 * screen, each of Claude's changes asked once the playhead reaches it, and
 * then whose idea the scene playing is, until the owner has said so.
 */
const Watch = ({
  state,
  screen,
  project,
  dispatch,
}: {
  state: StudioState
  screen: WatchScreen
  project: Project
  dispatch: Dispatch
}): JSX.Element => {
  const noteId = useId()
  const [text, setText] = useState("")
  const words = WORDS.watch
  const { review, video } = screen
  const asked =
    review === null
      ? null
      : askedAt(changesIn(project, review), screen.atMs, screen.answered)
  const here = review === null ? null : shotAt(review, screen.atMs)
  const idea = ideaAsking(project, screen, ideasAnswering(state, project.id))
  const scene =
    screen.origin !== null
      ? originView(project, screen.origin.shot)
      : here === null
        ? null
        : originView(project, here.shot)
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl font-extrabold">{words.heading}</h2>
      {review === null || video === null ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">{words.open}</span>
          <input
            type="file"
            multiple
            accept="video/*,application/json,.json"
            onChange={(event) => {
              const files = [...(event.currentTarget.files ?? [])]
              if (files.length > 0) dispatch({ type: "reviewPicked", files })
            }}
          />
          <span className="text-muted-foreground">{words.openHint}</span>
        </label>
      ) : (
        <>
          <ReviewVideo
            video={video}
            startMs={screen.atMs}
            dispatch={dispatch}
          />
          {asked !== null && (
            <div className="border-brand space-y-2 rounded-2xl border-2 p-3">
              <p className="text-sm">{words.changed(asked.note.text)}</p>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    dispatch({ type: "changeGood", note: asked.note.id })
                  }
                >
                  {words.good}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    dispatch({ type: "changeNotYet", note: asked.note.id })
                  }
                >
                  {words.notYet}
                </Button>
              </div>
            </div>
          )}
          {screen.origin !== null && scene !== null ? (
            <IdeaFix
              fix={screen.origin}
              initialText={screen.origin.draft ?? ""}
              scene={scene}
              listen={screen.listen === "available"}
              speaking={screen.speaking}
              atMs={screen.atMs}
              dispatch={dispatch}
            />
          ) : (
            <>
              {scene !== null && asked === null && (
                <IdeaAsk
                  scene={scene}
                  asking={idea === scene.shot}
                  dispatch={dispatch}
                />
              )}
              <NoteHere
                text={text}
                setText={setText}
                noteId={noteId}
                canNote={here !== null}
                atMs={screen.atMs}
                dispatch={dispatch}
              />
              {screen.listen === "available" && (
                <SpokenNote
                  speaking={screen.speaking}
                  atMs={screen.atMs}
                  canStart={here !== null}
                  dispatch={dispatch}
                />
              )}
            </>
          )}
        </>
      )}
      <Button variant="ghost" onClick={() => dispatch({ type: "watchBack" })}>
        {words.back}
      </Button>
      <Notice text={state.notice} />
    </div>
  )
}

/** Watch's one main button: a typed note, pinned to the moment on screen. */
const NoteHere = ({
  text,
  setText,
  noteId,
  canNote,
  atMs,
  dispatch,
}: {
  text: string
  setText: (text: string) => void
  noteId: string
  canNote: boolean
  atMs: number
  dispatch: Dispatch
}): JSX.Element => {
  const words = WORDS.watch
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        dispatch({ type: "notedHere", text })
        setText("")
      }}
    >
      <label htmlFor={noteId} className="text-sm font-semibold">
        {words.noteLabel}
      </label>
      <input
        id={noteId}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        className="border-input bg-background focus-visible:ring-ring rounded-xl border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
      />
      <Button type="submit" size="lg" disabled={text.trim() === "" || !canNote}>
        {words.noteHere(atMs)}
      </Button>
    </form>
  )
}

/**
 * Whose idea the scene playing is (ST5, ST16): asked once, That's right or
 * Not quite, until the owner has said it of the scene as it stands; then
 * said, quietly, as the scene plays.
 */
const IdeaAsk = ({
  scene,
  asking,
  dispatch,
}: {
  scene: OriginView
  asking: boolean
  dispatch: Dispatch
}): JSX.Element | null => {
  const words = WORDS.origin
  if (!asking)
    return scene.confirmed ? (
      <p className="text-muted-foreground text-sm">
        {words.said(scene.n, scene.whose)}
      </p>
    ) : null
  return (
    <div className="border-brand space-y-2 rounded-2xl border-2 p-3">
      <p className="font-semibold">{words.question(scene.n)}</p>
      <p className="text-sm">{words.proposed(scene.whose)}</p>
      <div className="flex gap-2">
        <Button
          onClick={() => dispatch({ type: "ideaRight", shot: scene.shot })}
        >
          {words.right}
        </Button>
        <Button
          variant="outline"
          onClick={() => dispatch({ type: "ideaNotQuite", shot: scene.shot })}
        >
          {words.notQuite}
        </Button>
      </div>
    </div>
  )
}

type OriginFix = NonNullable<WatchScreen["origin"]>

/**
 * Putting a scene's idea right (ST5): whose it is, then, for yours, where
 * your own words are: the scene's take, or words typed or said now, kept as
 * your note. The video credits you with an idea only where they show it.
 */
const IdeaFix = ({
  fix,
  initialText,
  scene,
  listen,
  speaking,
  atMs,
  dispatch,
}: {
  fix: OriginFix
  /** The words of this correction not kept last time, read once. */
  initialText: string
  scene: OriginView
  listen: boolean
  speaking: WatchScreen["speaking"]
  atMs: number
  dispatch: Dispatch
}): JSX.Element => {
  const wordsId = useId()
  // An edit buffer for this correction alone: it mounts with it.
  const [text, setText] = useState(initialText)
  const words = WORDS.origin
  const back = (
    <Button variant="ghost" onClick={() => dispatch({ type: "ideaBack" })}>
      {words.back}
    </Button>
  )
  if (fix.step === "who")
    return (
      <div className="border-brand flex flex-col gap-2 rounded-2xl border-2 p-3">
        <p className="font-semibold">{words.who}</p>
        <Button
          size="lg"
          onClick={() => dispatch({ type: "ideaWho", who: "you" })}
        >
          {scene.idea.origin === "you" ? words.mineElse : words.mine}
        </Button>
        <Button
          variant="outline"
          onClick={() => dispatch({ type: "ideaWho", who: "agent" })}
        >
          {words.claudes}
        </Button>
        {back}
      </div>
    )
  const take = scene.take
  return (
    <div className="border-brand flex flex-col gap-2 rounded-2xl border-2 p-3">
      <p className="font-semibold">{words.where}</p>
      <p className="text-muted-foreground text-sm">{words.whereHint}</p>
      {take !== null && speaking === null && (
        <Button size="lg" onClick={() => dispatch({ type: "ideaInTake" })}>
          {words.inTake}
        </Button>
      )}
      {speaking === null && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            dispatch({ type: "ideaInWords", text })
          }}
        >
          <label htmlFor={wordsId} className="text-sm font-semibold">
            {words.wordsLabel}
          </label>
          <input
            id={wordsId}
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            className="border-input bg-background focus-visible:ring-ring rounded-xl border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
          <Button
            type="submit"
            variant={take === null ? "default" : "outline"}
            disabled={text.trim() === ""}
          >
            {words.keepWords}
          </Button>
        </form>
      )}
      {listen && (
        <SpokenNote
          speaking={speaking}
          atMs={atMs}
          canStart
          dispatch={dispatch}
          start={words.say}
          keep={words.keepWords}
        />
      )}
      {back}
    </div>
  )
}

/**
 * A note said instead of typed (STUDIO ST5): the words as they are heard,
 * then kept as a note at the moment it was begun, said again, or let go.
 */
const SpokenNote = ({
  speaking,
  atMs,
  canStart,
  dispatch,
  start,
  keep,
}: {
  speaking: WatchScreen["speaking"]
  atMs: number
  canStart: boolean
  dispatch: Dispatch
  /** What its buttons say, when the words are for a scene's idea. */
  start?: string
  keep?: string
}): JSX.Element => {
  const words = WORDS.watch
  if (speaking === null)
    return (
      <Button
        variant="outline"
        size="lg"
        disabled={!canStart}
        onClick={() => dispatch({ type: "speakPressed" })}
      >
        <Mic aria-hidden />
        {start ?? words.say(atMs)}
      </Button>
    )
  if (speaking.phase === "listening" || speaking.phase === "finishing") {
    const where =
      speaking.phase === "finishing"
        ? words.finishing
        : speaking.ready
          ? words.listening
          : words.gettingReady
    return (
      <div className="flex flex-col gap-2" aria-live="polite">
        <p className="text-sm">
          {speaking.words === "" ? (
            <span className="text-muted-foreground">{where}</span>
          ) : (
            speaking.words
          )}
        </p>
        {speaking.phase === "listening" ? (
          <Button size="lg" onClick={() => dispatch({ type: "speakStopped" })}>
            <Square aria-hidden />
            {words.stop}
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">{words.finishing}</p>
        )}
      </div>
    )
  }
  return (
    <div className="border-brand flex flex-col gap-2 rounded-2xl border-2 p-3">
      <p className="text-sm">{speaking.words}</p>
      <Button size="lg" onClick={() => dispatch({ type: "spokenKept" })}>
        {keep ?? words.keepSaid(speaking.atMs)}
      </Button>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => dispatch({ type: "spokenAgain" })}
        >
          {words.again}
        </Button>
        <Button
          variant="ghost"
          onClick={() => dispatch({ type: "spokenDropped" })}
        >
          {words.drop}
        </Button>
      </div>
    </div>
  )
}

/**
 * Finish (STUDIO ST7): ready for YouTube, or the one thing missing with a
 * button straight to it; once ready, the upload copy and the link it went
 * up at.
 */
const Finish = ({
  state,
  project,
  dispatch,
}: {
  state: StudioState
  project: Project
  dispatch: Dispatch
}): JSX.Element => {
  const linkId = useId()
  const [link, setLink] = useState("")
  const finish = finishOf(project)
  const words = WORDS.finish
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl font-extrabold">{words.heading}</h2>
      {finish.kind === "note" && (
        <>
          <p className="text-sm">{words.note(finish.note.text)}</p>
          <Button size="lg" onClick={() => dispatch({ type: "finishGo" })}>
            {words.goNote}
          </Button>
        </>
      )}
      {finish.kind === "take" && (
        <>
          <p className="text-sm">{words.take(finish.n)}</p>
          <Button size="lg" onClick={() => dispatch({ type: "finishGo" })}>
            {words.goTake(finish.n)}
          </Button>
        </>
      )}
      {finish.kind === "idea" && (
        <>
          <p className="text-sm">{words.idea(finish.count)}</p>
          <Button size="lg" onClick={() => dispatch({ type: "finishGo" })}>
            {words.goIdea(finish.n)}
          </Button>
        </>
      )}
      {finish.kind === "unmarked" && (
        <>
          <p className="text-sm">{words.unmarked}</p>
          <Button size="lg" onClick={() => dispatch({ type: "readyMarked" })}>
            {words.mark}
          </Button>
        </>
      )}
      {finish.kind === "ready" && (
        <>
          <p className="text-base font-extrabold">{words.ready}</p>
          <p className="text-muted-foreground text-sm">{words.uploadCopy}</p>
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              dispatch({ type: "linkPasted", text: link })
            }}
          >
            <label htmlFor={linkId} className="text-sm font-semibold">
              {words.linkLabel}
            </label>
            <input
              id={linkId}
              type="url"
              inputMode="url"
              value={link}
              onChange={(event) => setLink(event.currentTarget.value)}
              className="border-input bg-background focus-visible:ring-ring rounded-xl border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
            <Button type="submit" disabled={link.trim() === ""}>
              {words.keepLink}
            </Button>
          </form>
        </>
      )}
      {finish.kind === "released" && (
        <>
          <p className="text-sm">{words.releasedLine}</p>
          <a
            href={finish.url}
            target="_blank"
            rel="noreferrer"
            className="text-brand text-sm font-semibold underline"
          >
            {words.watchIt}
          </a>
        </>
      )}
      <Button variant="ghost" onClick={() => dispatch({ type: "finishBack" })}>
        {words.back}
      </Button>
      <Notice text={state.notice} />
    </div>
  )
}

export const Studio = ({
  ports,
  share,
  newIdea,
  ideas,
  initialProject,
}: StudioProps): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime is created once per mount, as the soundbites page's is */
  const [runtime] = useState(() =>
    createStudio({ ...phoneStudioPorts(), ...ports }, initialProject ?? null)
  )
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => runtime.attach(), [runtime])
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const { dispatch } = runtime
  const { shelf, screen } = state

  if (shelf.kind === "reading")
    return <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
  if (shelf.kind === "unreadable")
    return (
      <div role="alert" className="space-y-2 text-sm">
        <p className="text-muted-foreground">{WORDS.unreadable}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => dispatch({ type: "retryRead" })}
        >
          {WORDS.readAgain}
        </Button>
      </div>
    )
  const project = projectOf(state)
  if (screen.kind === "record" && project !== null) {
    const view = recordView(project, screen.shot)
    if (view !== null)
      return <Record state={state} view={view} dispatch={dispatch} />
  }
  if (screen.kind === "done")
    return (
      <Done state={state} project={project} dispatch={dispatch} share={share} />
    )
  if (screen.kind === "shape" && project !== null)
    return <Shape screen={screen} project={project} dispatch={dispatch} />
  if (screen.kind === "history" && project !== null)
    return <History project={project} dispatch={dispatch} />
  if (screen.kind === "time" && project !== null)
    return <TimeSpent log={screen.log} project={project} dispatch={dispatch} />
  if (screen.kind === "watch" && project !== null)
    return (
      <Watch
        state={state}
        screen={screen}
        project={project}
        dispatch={dispatch}
      />
    )
  if (screen.kind === "finish" && project !== null)
    return <Finish state={state} project={project} dispatch={dispatch} />
  return (
    <Start
      state={state}
      project={project}
      dispatch={dispatch}
      share={share}
      newIdea={newIdea}
      ideas={ideas}
    />
  )
}
