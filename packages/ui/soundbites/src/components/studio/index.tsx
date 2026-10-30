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
import { useEffect, useId, useState, useSyncExternalStore } from "react"
import { cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { phoneStudioPorts } from "@soundbites/lib/phone"
import type { Project } from "@soundbites/lib/project/model"
import { lengthFor } from "@soundbites/lib/project/script"
import type { StudioIntent, StudioState } from "@soundbites/lib/studio/machine"
import { isSettled } from "@soundbites/lib/studio/machine"
import type { StudioPorts } from "@soundbites/lib/studio/runtime"
import { createStudio } from "@soundbites/lib/studio/runtime"
import type { RecordView } from "@soundbites/lib/studio/view"
import { opensOn, recordView, startView } from "@soundbites/lib/studio/view"
import type { Snag, Went } from "@soundbites/lib/studio/words"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { FolderOpen, Mic, Pause, Play, Square } from "lucide-react"

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
}

type Dispatch = (intent: StudioIntent) => void

const Notice = ({ text }: { text: string }): JSX.Element => (
  <p aria-live="polite" className="text-muted-foreground min-h-5 text-sm">
    {text}
  </p>
)

/** The quiet file pick that opens a primer. */
const PrimerPick = ({
  state,
  dispatch,
  label,
}: {
  state: StudioState
  dispatch: Dispatch
  label: string
}): JSX.Element => {
  const hint = useId()
  return (
    <label className="bg-background border-border/60 focus-within:ring-ring relative flex cursor-pointer items-center gap-3 rounded-2xl border p-3 focus-within:ring-2">
      <FolderOpen className="text-primary size-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span
          id={hint}
          aria-live="polite"
          className={cn(
            "block text-xs",
            state.primerProblem === null
              ? "text-muted-foreground"
              : "text-destructive"
          )}
        >
          {state.primerProblem ?? WORDS.start.primerHint}
        </span>
      </span>
      <input
        type="file"
        accept=".json,application/json"
        aria-describedby={hint}
        className="sr-only"
        disabled={!isSettled(state.activity)}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          // The same file again is a new pick.
          event.currentTarget.value = ""
          if (file) dispatch({ type: "primerPicked", file })
        }}
      />
    </label>
  )
}

const Start = ({
  state,
  project,
  dispatch,
}: {
  state: StudioState
  project: Project | null
  dispatch: Dispatch
}): JSX.Element => {
  const view = project === null ? null : startView(project)
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
      {view !== null && (
        <ul className="flex flex-col gap-2">
          {view.sittings.map((row) => (
            <li key={row.kind}>
              {row.open ? (
                <button
                  type="button"
                  onClick={() => dispatch({ type: "recordChosen" })}
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
      <PrimerPick
        state={state}
        dispatch={dispatch}
        label={
          project === null ? WORDS.start.openPrimer : WORDS.start.openNewer
        }
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
          <Button onClick={() => dispatch({ type: "keepNextPressed" })}>
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
              className="h-auto min-h-10 text-wrap"
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
          {share({
            project,
            onArrived: (takes) => dispatch({ type: "takesArrived", takes }),
          })}
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

export const Studio = ({ ports, share }: StudioProps): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime is created once per mount, as the soundbites page's is */
  const [runtime] = useState(() =>
    createStudio({ ...phoneStudioPorts(), ...ports })
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
  const { project } = shelf
  if (screen.kind === "record" && project !== null) {
    const view = recordView(project, screen.shot)
    if (view !== null)
      return <Record state={state} view={view} dispatch={dispatch} />
  }
  if (screen.kind === "done")
    return (
      <Done state={state} project={project} dispatch={dispatch} share={share} />
    )
  return <Start state={state} project={project} dispatch={dispatch} />
}
