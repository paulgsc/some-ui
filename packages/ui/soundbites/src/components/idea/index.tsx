/**
 * Answering Claude's questions about an idea (STUDIO ST19), opened on it
 * from the idea shelf: one question per screen in large type, one button to
 * say it. Renders `lib/idea/machine.ts`'s state and forwards taps; its words
 * are the turn's (`TURN_WORDS`) around Studio's (`idea`). A new idea is caught as one bundle instead
 * (`../idea-bundle`, ST26).
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useId, useState, useSyncExternalStore } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Button, Notice } from "@some-ui/shared"
import type { TurnPhase } from "@some-ui/voice-capture"
import { TURN_WORDS, turnNoticeSaid } from "@some-ui/voice-capture"
import type { IdeaIntent, IdeaState } from "@soundbites/lib/idea/machine"
import { questionNumber } from "@soundbites/lib/idea/machine"
import type { AnswerTo, Idea } from "@soundbites/lib/idea/model"
import { isFollowUp, skippedAsks } from "@soundbites/lib/idea/model"
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
  /** The idea whose questions from Claude to ask (ST19), by id. Read once, on mount. */
  answering: string
}

type Dispatch = (intent: IdeaIntent) => void

/** Where a listening with no words yet is (LS1). */
function hearingWhere(
  phase: Extract<TurnPhase, { kind: "listening" | "finishing" }>
): string {
  if (phase.kind === "finishing") return TURN_WORDS.finishing
  return phase.ready ? TURN_WORDS.listening : TURN_WORDS.gettingReady
}

const Words = ({
  phase,
  dispatch,
  label,
}: {
  phase: Extract<TurnPhase, { kind: "fixing" | "typing" }>
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
        {TURN_WORDS.typeHint}
      </p>
      <Button
        size="lg"
        disabled={phase.draft.trim() === ""}
        onClick={() => dispatch({ type: "save" })}
      >
        {TURN_WORDS.keepWords}
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
  phase: TurnPhase
  dispatch: Dispatch
}): JSX.Element => {
  const { eyebrow, ask, hint } = wordsOf(question, state.idea)
  const { voice, notice } = state.turn
  const canTalk = voice === "ready"
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
          {eyebrow}
        </p>
        <h2 className="text-3xl font-extrabold text-balance">{ask}</h2>
        <p className="text-muted-foreground text-sm">{hint}</p>
      </header>

      {/* What is heard and what to do with it grow below the controls. */}
      <div className="flex flex-col gap-2">
        {phase.kind === "listening" ||
        phase.kind === "finishing" ||
        phase.kind === "hearing" ? (
          <Button
            size="lg"
            disabled={phase.kind !== "listening"}
            onClick={() => dispatch({ type: "stopTalking" })}
          >
            <Square className="size-5" aria-hidden="true" />
            {TURN_WORDS.stop}
          </Button>
        ) : (
          <Button
            size="lg"
            disabled={
              !canTalk || (phase.kind !== "idle" && phase.kind !== "heard")
            }
            onClick={() => dispatch({ type: "talk" })}
          >
            <Mic className="size-5" aria-hidden="true" />
            {phase.kind === "heard" ? TURN_WORDS.again : TURN_WORDS.talk}
          </Button>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={
              phase.kind === "heard" ||
              phase.kind === "fixing" ||
              phase.kind === "typing"
            }
            onClick={() => dispatch({ type: "type" })}
          >
            {TURN_WORDS.type}
          </Button>
          {state.idea !== null && (
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

      {(phase.kind === "listening" || phase.kind === "finishing") &&
        phase.words !== "" && (
          <p
            aria-live="polite"
            className="bg-card border-border/60 rounded-2xl border p-3 text-lg"
          >
            {phase.words}
          </p>
        )}
      {phase.kind === "heard" && (
        <div className="flex flex-col gap-2">
          <p className="bg-card border-border/60 rounded-2xl border p-3 text-lg">
            {phase.words}
          </p>
          <Button size="lg" onClick={() => dispatch({ type: "meant" })}>
            {TURN_WORDS.meant}
          </Button>
          <Button variant="outline" onClick={() => dispatch({ type: "fix" })}>
            {TURN_WORDS.fix}
          </Button>
        </div>
      )}
      {(phase.kind === "fixing" || phase.kind === "typing") && (
        <Words phase={phase} dispatch={dispatch} label={ask} />
      )}

      {(phase.kind === "listening" || phase.kind === "finishing") && (
        <Notice>{hearingWhere(phase)}</Notice>
      )}
      {phase.kind === "hearing" && (
        <Notice>
          <span className="block">{TURN_WORDS.hearing}</span>
          <span className="text-muted-foreground block">
            {TURN_WORDS.hearingLine}
          </span>
        </Notice>
      )}
      {notice !== null && <Notice>{turnNoticeSaid(notice)}</Notice>}
      {voice === "unavailable" && phase.kind === "typing" && (
        <Notice>{WORDS.noVoice}</Notice>
      )}
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
  const asks = state.idea === null ? 0 : skippedAsks(state.idea).length
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl font-extrabold">{WORDS.kept}</h2>
      <p className="text-muted-foreground text-sm">
        {asks === 0
          ? STUDIO_WORDS.shelf.answered
          : STUDIO_WORDS.shelf.answeredSkipping(asks)}
      </p>
      {asks > 0 && (
        <Button
          variant="outline"
          onClick={() => dispatch({ type: "answerSkipped" })}
        >
          {WORDS.answerSkipped(asks)}
        </Button>
      )}
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
    createIdeaCapture({ ...phoneIdeaPorts(), ...ports }, answering)
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
        <>
          <Notice
            tone="danger"
            action={{
              label: STUDIO_WORDS.readAgain,
              onClick: () => dispatch({ type: "readAgain" }),
            }}
          >
            {WORDS.unreadable}
          </Notice>
          {back}
        </>
      )
    }
    case "ask": {
      return (
        <Ask
          state={state}
          question={screen.question}
          phase={state.turn.phase}
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
