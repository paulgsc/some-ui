/**
 * Catching a video idea the moment it comes (STUDIO ST18): one question per
 * screen in large type, one button to say it. Renders `lib/idea/machine.ts`'s
 * state and forwards taps; its words are Studio's (`idea`). Opened on one
 * idea (`answering`, ST19), it asks Claude's questions about it the same way.
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useId, useState, useSyncExternalStore } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import type {
  AskPhase,
  IdeaIntent,
  IdeaState,
} from "@soundbites/lib/idea/machine"
import { questionNumber } from "@soundbites/lib/idea/machine"
import type { AnswerTo, Idea } from "@soundbites/lib/idea/model"
import { isFollowUp, isRequired, unanswered } from "@soundbites/lib/idea/model"
import type { IdeaPorts } from "@soundbites/lib/idea/runtime"
import { createIdeaCapture } from "@soundbites/lib/idea/runtime"
import { phoneIdeaPorts } from "@soundbites/lib/phone"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { Mic, Square } from "lucide-react"

const WORDS = STUDIO_WORDS.idea

export type IdeaCaptureProps = {
  /**
   * The phone's ports, with its recognizer where the build has one, unless
   * a test says otherwise. Read once, on mount.
   */
  ports?: Partial<IdeaPorts>
  /** The way back to Studio, as the app links it. */
  back?: ReactNode
  /**
   * The idea whose questions from Claude to ask (ST19), by id; with none,
   * New idea. Read once, on mount.
   */
  answering?: string
}

type Dispatch = (intent: IdeaIntent) => void

/** Where a listening with no words yet is (LS1). */
function hearingWhere(
  phase: Extract<AskPhase, { kind: "listening" | "finishing" }>
): string {
  if (phase.kind === "finishing") return WORDS.finishing
  return phase.ready ? WORDS.listening : WORDS.gettingReady
}

const Words = ({
  phase,
  dispatch,
  label,
}: {
  phase: Extract<AskPhase, { kind: "fixing" | "typing" }>
  dispatch: Dispatch
  label: string
}): JSX.Element => {
  const hint = useId()
  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label={label}
        aria-describedby={hint}
        value={phase.draft}
        rows={4}
        onChange={(event) =>
          dispatch({ type: "draft", text: event.currentTarget.value })
        }
        className="bg-background border-border focus-visible:ring-ring min-h-28 w-full rounded-2xl border p-3 text-lg focus-visible:ring-2 focus-visible:outline-none"
      />
      <p id={hint} className="text-muted-foreground text-xs">
        {WORDS.typeHint}
      </p>
      <Button
        size="lg"
        disabled={phase.draft.trim() === ""}
        onClick={() => dispatch({ type: "save" })}
      >
        {WORDS.keepWords}
      </Button>
    </div>
  )
}

/** What a question says: one of the idea's own, or Claude's about it. */
function wordsOf(
  question: AnswerTo,
  idea: Idea | null
): { eyebrow: string; ask: string; hint: string } {
  const { n, of } = questionNumber(question, idea)
  if (isFollowUp(question))
    return {
      eyebrow: STUDIO_WORDS.shelf.askedOf(n, of),
      ask: idea?.asked?.find((each) => each.id === question)?.words ?? "",
      hint: STUDIO_WORDS.shelf.askedHint,
    }
  return { eyebrow: WORDS.questionOf(n, of), ...WORDS.questions[question] }
}

const Ask = ({
  state,
  question,
  phase,
  dispatch,
}: {
  state: IdeaState
  question: AnswerTo
  phase: AskPhase
  dispatch: Dispatch
}): JSX.Element => {
  const { eyebrow, ask, hint } = wordsOf(question, state.idea)
  const canTalk = state.voice === "ready"
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
          {eyebrow}
        </p>
        <h2 className="text-3xl font-extrabold text-balance">{ask}</h2>
        <p className="text-muted-foreground text-sm">{hint}</p>
      </header>

      {(phase.kind === "listening" ||
        phase.kind === "finishing" ||
        phase.kind === "heard") && (
        <p
          aria-live="polite"
          className="bg-card border-border/60 min-h-24 rounded-2xl border p-3 text-lg"
        >
          {phase.kind !== "heard" && phase.words === "" ? (
            <span className="text-muted-foreground">{hearingWhere(phase)}</span>
          ) : (
            phase.words
          )}
        </p>
      )}
      {phase.kind === "finishing" && phase.words !== "" && (
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {WORDS.finishing}
        </p>
      )}

      {phase.kind === "idle" && canTalk && (
        <Button size="lg" onClick={() => dispatch({ type: "talk" })}>
          <Mic className="size-5" aria-hidden="true" />
          {WORDS.talk}
        </Button>
      )}
      {phase.kind === "listening" && (
        <Button size="lg" onClick={() => dispatch({ type: "stopTalking" })}>
          <Square className="size-5" aria-hidden="true" />
          {WORDS.stop}
        </Button>
      )}
      {phase.kind === "heard" && (
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={() => dispatch({ type: "right" })}>
            {WORDS.right}
          </Button>
          <Button variant="outline" onClick={() => dispatch({ type: "fix" })}>
            {WORDS.fix}
          </Button>
          {canTalk && (
            <Button
              variant="outline"
              onClick={() => dispatch({ type: "talk" })}
            >
              {WORDS.again}
            </Button>
          )}
        </div>
      )}
      {(phase.kind === "fixing" || phase.kind === "typing") && (
        <Words phase={phase} dispatch={dispatch} label={ask} />
      )}

      <p aria-live="polite" className="text-muted-foreground min-h-5 text-sm">
        {state.notice === null ? "" : WORDS[state.notice]}
      </p>
      {state.voice === "unavailable" && phase.kind === "typing" && (
        <p className="text-muted-foreground text-xs">{WORDS.noVoice}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {(phase.kind === "idle" ||
          phase.kind === "listening" ||
          phase.kind === "finishing") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "type" })}
          >
            {WORDS.type}
          </Button>
        )}
        {state.idea === null &&
          state.skipped !== null &&
          (phase.kind === "idle" || phase.kind === "typing") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: "answerSkipped" })}
            >
              {WORDS.answerSkippedEarlier(unanswered(state.skipped).length)}
            </Button>
          )}
        {!isRequired(question) && state.idea !== null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "skip" })}
          >
            {WORDS.skip}
          </Button>
        )}
      </div>
    </div>
  )
}

const Kept = ({
  state,
  dispatch,
  back,
}: {
  state: IdeaState
  dispatch: Dispatch
  back: ReactNode
}): JSX.Element => {
  const skipped = state.idea === null ? 0 : unanswered(state.idea).length
  const answers = state.idea?.answers.length ?? 0
  if (state.focus !== null)
    return (
      <div className="flex flex-col gap-3">
        <h2 role="status" className="text-2xl font-extrabold">
          {WORDS.kept}
        </h2>
        <p className="text-muted-foreground text-sm">
          {STUDIO_WORDS.shelf.answered}
        </p>
        {back}
      </div>
    )
  return (
    <div className="flex flex-col gap-3">
      <h2 role="status" className="text-2xl font-extrabold">
        {WORDS.kept}
      </h2>
      <p className="text-muted-foreground text-sm">{WORDS.keptLine(answers)}</p>
      {skipped > 0 && (
        <Button
          variant="outline"
          onClick={() => dispatch({ type: "answerSkipped" })}
        >
          {WORDS.answerSkipped(skipped)}
        </Button>
      )}
      <Button onClick={() => dispatch({ type: "another" })}>
        {WORDS.another}
      </Button>
      {back}
    </div>
  )
}

export const IdeaCapture = ({
  ports,
  back,
  answering,
}: IdeaCaptureProps): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime is created once per mount, as Studio's is */
  const [runtime] = useState(() =>
    createIdeaCapture({ ...phoneIdeaPorts(), ...ports }, answering ?? null)
  )
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => runtime.attach(), [runtime])
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const { dispatch } = runtime
  const { screen } = state

  switch (screen.kind) {
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
            {STUDIO_WORDS.readAgain}
          </Button>
          {back}
        </div>
      )
    }
    case "ask": {
      return (
        <Ask
          state={state}
          question={screen.question}
          phase={screen.phase}
          dispatch={dispatch}
        />
      )
    }
    case "kept": {
      return <Kept state={state} dispatch={dispatch} back={back} />
    }
    default: {
      return assertNever(screen)
    }
  }
}
