import type { FC } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { ExerciseCard } from "@leetype/components/typing-game/exercise-card"
import { ExerciseHeader } from "@leetype/components/typing-game/exercise-header"
import { RationaleAccordion } from "@leetype/components/typing-game/rationale-accordion"
import { ResultsCard } from "@leetype/components/typing-game/results-card"
import { TypingErrorAlert } from "@leetype/components/typing-game/typing-error-alert"
import { useExerciseRunner } from "@leetype/hooks/leetype/use-exercise-runner"
import { useKeystrokeIntervals } from "@leetype/hooks/leetype/use-keystroke-intervals"
import { useTypingGame } from "@leetype/hooks/leetype/use-typing-game-wasm"
import type { Baseline } from "@leetype/lib/leetype/baseline-store"
import {
  blendBaseline,
  loadBaseline,
  sampleFromIntervals,
  saveBaseline,
} from "@leetype/lib/leetype/baseline-store"
import { CALIBRATION_STEP } from "@leetype/lib/leetype/baseline-store/calibration"
import {
  nextExercise,
  SESSION_EXERCISE_IDS,
} from "@leetype/lib/leetype/exercises"
import {
  createExerciseSchedule,
  takeScheduledExercise,
} from "@leetype/lib/leetype/exercises/scheduling"
import type { ExerciseSchedule } from "@leetype/lib/leetype/exercises/scheduling"
import type { Exercise, RationaleChoice } from "@leetype/types/exercise"
import { typingBlockOf } from "@leetype/types/exercise"
import type {
  CompletedSessionStats,
  GameState,
  TextGradient,
} from "@leetype/types/leetype"
import { VISIBILITY_REVEALED } from "@leetype/types/leetype"
import { Button } from "@some-ui/shared"
import type { Appearance } from "@some-ui/styles/theme"
import { appearanceClassName } from "@some-ui/styles/theme"
import { cn } from "some-ui-utils"

/**
 * A baseline sample from one finished step.
 *
 * The step's mean inter-keystroke interval, repeated once per resolved slot:
 * the store's trimmed mean wants a distribution, and a completed step only
 * reports a total. That makes this a *weaker* sample than a real calibration
 * run — which is exactly right, since the blend is deliberately slow. A step
 * too short to say anything returns `null` rather than a loud guess.
 */
function sampleFromStep(
  elapsedSeconds: number,
  correct: number
): Baseline | null {
  if (elapsedSeconds <= 0 || correct <= 1) return null
  const meanInterval = (elapsedSeconds * 1000) / correct
  return sampleFromIntervals(
    Array.from({ length: correct }, () => meanInterval)
  )
}

type LeetypeProps = {
  /**
   * A fixed exercise for a preview or deep link. Normal sessions omit this
   * prop and traverse the eligible corpus through the seeded schedule.
   *
   * This prop is the seam a future generator plugs into — see
   * `lib/leetype/exercises`. Everything above it (the runner, the card, the
   * engine) is indifferent to where the value came from.
   */
  exercise?: Exercise
  /** Session term supplied by the composer/scene, in milliseconds. */
  sessionDurationMs?: number
  /** Deterministic override for tests, previews, and replaying an ordering bug. */
  sessionSeed?: number
  /** Cosmetic. See `TextGradient`. */
  textGradient?: TextGradient
  /** Called once the whole sequence is finished. */
  onSessionComplete?: (stats: CompletedSessionStats) => void
  /**
   * Art direction. `inherit` — the default — renders in whatever theme the
   * host established, so the user's session theme reaches this surface like
   * any other component.
   *
   * This used to be hardcoded as `dark code`, which is why picking a light
   * palette left the typing game dark: `.code` reassigns `--background` /
   * `--foreground` for its subtree, and the bundled `dark` kept every
   * `dark:*` utility inside it active regardless of the user's choice. A host
   * that genuinely wants the vim-night editor surface — a full-bleed practice
   * route, say — passes `appearance="code"` and gets exactly the old look.
   */
  appearance?: Appearance
}

/**
 * LeetType: a competency probe whose input modality happens to be typing.
 *
 * The loop is *read one sentence → type → observe → repeat*, with no menus
 * in it. The composer supplies only the session term; within that term the
 * seeded exercise schedule and the baseline-relative gate decide what comes
 * next. There is no challenge picker and no XP.
 *
 * This component is composition, not orchestration. Three collaborators,
 * each ignorant of the others:
 *
 * - `useExerciseRunner` — which step, and when to leave it. No typing state.
 * - `useTypingGame` — slots, caret, reveal, the two WPM figures. No idea
 *   what a step is.
 * - `ExerciseCard` — draws one step against those projections.
 *
 * The seam between the first two is the `advance` call below, and it is
 * asked-for rather than assumed: the runner is handed the engine's own
 * verdict on the finished step.
 */
export const Leetype: FC<LeetypeProps> = ({
  exercise,
  sessionDurationMs = 10 * 60_000,
  sessionSeed,
  textGradient,
  onSessionComplete,
  appearance = "inherit",
}) => {
  const [seed] = useState(
    () => sessionSeed ?? crypto.getRandomValues(new Uint32Array(1))[0]!
  )
  const [initialSelection] = useState(() => {
    if (exercise !== undefined) return null
    const first = takeScheduledExercise(
      SESSION_EXERCISE_IDS,
      createExerciseSchedule(SESSION_EXERCISE_IDS, seed)
    )
    return first
  })
  const scheduleRef = useRef<ExerciseSchedule | null>(
    initialSelection?.schedule ?? null
  )
  const [resolvedExercise, setResolvedExercise] = useState<Exercise>(
    () => exercise ?? nextExercise({ preferId: initialSelection?.exerciseId })
  )
  const runner = useExerciseRunner(resolvedExercise)

  const [gameState, setGameState] = useState<GameState>("idle")
  /**
   * A player with no stored baseline warms up first.
   *
   * Mechanically the same typing surface with the new features switched off:
   * nothing masked, nothing gated, one line of prompt. It is not part of the
   * exercise and the runner never sees it — sequencing a warm-up would mean
   * teaching the runner what a warm-up is, and it proves no competency.
   *
   * Skipping it is not an option offered, but skipping it is also not
   * necessary: a player who somehow arrives without one still plays, on the
   * engine's cold-start stand-in.
   */
  const [phase, setPhase] = useState<"calibrating" | "exercise">(() =>
    loadBaseline() === null ? "calibrating" : "exercise"
  )
  /**
   * Set once, when the sequence ends. Everything the results surface shows
   * is a fact about a run that is over, so holding it as state — rather than
   * recomputing it every frame of a run that is still going — is both
   * cheaper and more honest.
   */
  const [finished, setFinished] = useState<CompletedSessionStats | null>(null)
  const [sessionClockMs, setSessionClockMs] = useState(0)
  const clockStartedAtRef = useRef<number | null>(null)
  const completedStepsRef = useRef(0)
  const escapedStepsRef = useRef(0)
  const exerciseCompletionHandledRef = useRef(false)

  /**
   * The most recently completed step's `rationaleChoices` (LTY-WHY W4,
   * #1104), decoupled from `runner`/`step` on purpose: the effect below
   * that credits a finished step and calls `runner.advance()` moves the
   * runner in the very same commit `isComplete` turns true, so a widget
   * keyed off `runner.step` directly would never get a render where the
   * step reads as both complete and current — a frozen copy captured here
   * is what lets the accordion actually be visible.
   *
   * Cleared from `recordKeystroke` below, on the player's *next* real
   * keystroke, rather than from an effect keyed on `stepKey`. That effect
   * shape was tried and breaks: `stepKey` changes in the same render pass
   * `runner.advance()` produces, so a `useEffect(() => set(null),
   * [stepKey])` would fire in the same `act()`-flushed cascade that just
   * set this value, clearing it before it is ever painted — no bug for a
   * human eye to notice, but caught the moment a test tried to observe the
   * intermediate state. Tying the clear to an actual DOM event instead of
   * a reactive effect sidesteps the whole class of "cascade undid the
   * state before it rendered" bug by construction.
   */
  const [completedRationale, setCompletedRationale] = useState<{
    key: string
    candidates: ReadonlyArray<RationaleChoice>
  } | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const onSessionCompleteRef = useRef(onSessionComplete)
  useEffect(() => {
    onSessionCompleteRef.current = onSessionComplete
  }, [onSessionComplete])

  /**
   * The player's sampled speed, as it stood when this mount began. Read once
   * so the engine can be constructed with it; every later sample reaches the
   * engine through `calibrate` rather than through a re-render.
   */
  const [initialBaseline] = useState<Baseline | null>(() => loadBaseline())
  const baselineRef = useRef<Baseline | null>(initialBaseline)
  /** Per-step assistance, banked as each step is left behind. */
  const assistanceRef = useRef<Array<number>>([])
  /**
   * Every interval of the warm-up, so the store gets a real distribution to
   * take a trimmed mean and an IQR from. A run's mean repeated has a
   * dispersion of zero, which would tell the deadband every player is a
   * metronome.
   */
  const warmUpIntervals = useKeystrokeIntervals()

  const calibrating = phase === "calibrating"
  const step = calibrating ? CALIBRATION_STEP : runner.step
  const source = typingBlockOf(step)?.source ?? ""
  /**
   * Which step this is, independent of what it says.
   *
   * Two different steps may carry the same source — a corpus is allowed to
   * repeat a proof — so identity has to be the step's own, not its text.
   */
  const stepKey = calibrating
    ? "warm-up"
    : `${resolvedExercise.id}:${runner.index}:${runner.step.id}`
  const attempt = calibrating ? 0 : runner.attempt

  const {
    layout,
    roles,
    slotOfDisplay,
    slotStatus,
    visibility,
    snapshot,
    rejection,
    press,
    backspace,
    start,
    onDismiss,
    toggleReveal,
    readProgression,
    activeStep,
    calibrate,
    isLoading,
    error,
  } = useTypingGame({
    targetCode: source,
    gameState,
    stepKey,
    attempt,
    initialBaseline: initialBaseline ?? undefined,
    maxConsecutiveErrors: 3,
  })

  /**
   * The warm-up's off switch, and the whole of it.
   *
   * `CodeDisplay` draws the visibility map it is handed and owns no masking
   * policy, so handing it an all-revealed map is how the reveal loop is
   * switched off for one step. No mode flag reached the engine, and the
   * renderer did not learn what calibration is.
   */
  const shownVisibility = calibrating
    ? new Uint8Array(visibility.length).fill(VISIBILITY_REVEALED)
    : visibility

  const recordKeystroke = useCallback(
    (key: string): void => {
      if (calibrating) warmUpIntervals.record()
      // A no-op once it is already null (see completedRationale's own doc
      // comment for why this, not an effect, is what retires it).
      setCompletedRationale(null)
      press(key)
    },
    [calibrating, warmUpIntervals, press]
  )

  const {
    showErrorAlert,
    consecutiveErrors,
    cursorDisplay,
    isComplete,
    correct,
    assisted,
    elapsedTime,
    sessionElapsedTime,
    wpm,
    accuracy,
    totalErrors,
    manualRevealActive,
    manualRevealFraction,
  } = snapshot

  /**
   * The warm-up already shows everything (`shownVisibility` above), so the
   * toggle's own affordance would be reporting a freeze that changes
   * nothing the player can see. Suppressed here rather than in
   * `ExerciseCard`, which has no idea a warm-up phase exists.
   */
  const shownManualRevealActive = calibrating ? false : manualRevealActive
  const shownManualRevealFraction = calibrating ? 0 : manualRevealFraction

  /**
   * The step is typed. Bank the assistance, feed the run back into the
   * baseline, ask the engine what the step was worth, and let the runner
   * move.
   *
   * Every part of that is unconditional and click-free: a miss never asks
   * the player to acknowledge anything, it just brings the same step round
   * again.
   */
  useEffect(() => {
    if (gameState !== "playing" || !isComplete) return
    // The guard that keeps a finished step from being resolved twice.
    //
    // This effect depends on the runner, so moving the runner re-runs it —
    // and on that pass `snapshot` still describes the step just finished,
    // because the engine has been *told* to swap but React has not yet
    // committed the result. Acting on that stale snapshot advances a second
    // time, and the player skips every other step. Asking the engine which
    // step it is actually holding is the whole fix; `index.test.tsx` is the
    // test that catches it going back.
    if (activeStep !== `${stepKey}#${attempt}`) return

    // The accordion's own trigger (LTY-WHY W4): captured independently of
    // the runner.advance() call below, so it survives the runner moving on
    // in this same tick. Cleared by recordKeystroke on the player's next
    // real keystroke (completedRationale's own doc comment), never here.
    // The step finishing is an engine fact arriving from outside React, the
    // same shape as the warm-up-ending and sequence-ending state changes
    // this effect already makes below.
    if (!calibrating && step.rationaleChoices !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompletedRationale({
        key: stepKey,
        candidates: step.rationaleChoices,
      })
    }

    // The warm-up ends the same way any step does, and then hands over. Its
    // sample is taken outright rather than blended: the cold start it
    // replaces was a stand-in, not evidence.
    if (calibrating) {
      const sample = sampleFromIntervals(warmUpIntervals.read())
      if (sample) {
        baselineRef.current = sample
        saveBaseline(sample)
        calibrate(sample)
      }
      warmUpIntervals.reset()
      // The warm-up finishing is an engine fact arriving from outside React —
      // the same shape as the sequence ending below, and for the same reason:
      // "which phase is this" is genuinely new state, not something derivable
      // during render from the engine's snapshot.

      setPhase("exercise")
      return
    }

    assistanceRef.current.push(correct > 0 ? assisted / correct : 0)

    // The run contributes to the sample, so the cold-start stand-in is
    // transient: a player who never calibrates still converges on their own
    // speed after a few steps. `calibrate` is a command to the engine, not a
    // React state change — the engine is the external system this effect
    // exists to synchronise with.
    const sample = sampleFromStep(elapsedTime, correct)
    if (sample) {
      const next = blendBaseline(baselineRef.current, sample)
      baselineRef.current = next
      saveBaseline(next)
      calibrate(next)
    }

    runner.advance(readProgression())
  }, [
    isComplete,
    gameState,
    activeStep,
    stepKey,
    attempt,
    calibrating,
    step,
    warmUpIntervals,
    correct,
    assisted,
    elapsedTime,
    runner,
    readProgression,
    calibrate,
  ])

  useEffect(() => {
    if (gameState !== "playing") {
      clockStartedAtRef.current = null
      return
    }
    const startedAt = clockStartedAtRef.current ?? performance.now()
    clockStartedAtRef.current = startedAt
    const update = (): void => {
      setSessionClockMs(
        Math.min(performance.now() - startedAt, sessionDurationMs)
      )
    }
    const timer = window.setInterval(update, 250)
    return (): void => window.clearInterval(timer)
  }, [gameState, sessionDurationMs])

  useEffect(() => {
    if (!runner.isFinished) exerciseCompletionHandledRef.current = false
  }, [runner.isFinished])

  useEffect(() => {
    if (calibrating || !runner.isFinished || gameState !== "playing") return
    if (exerciseCompletionHandledRef.current) return
    exerciseCompletionHandledRef.current = true

    completedStepsRef.current += runner.completed
    escapedStepsRef.current += runner.escaped

    if (sessionClockMs >= sessionDurationMs) return

    if (exercise !== undefined) {
      // Exercise props are the preview/deep-link seam. Preserve their
      // one-exercise completion contract while normal corpus sessions loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSessionClockMs(sessionDurationMs)
      return
    }

    const schedule = scheduleRef.current
    if (schedule === null) return
    const next = takeScheduledExercise(SESSION_EXERCISE_IDS, schedule)
    scheduleRef.current = next.schedule
    // The completed exercise is an external engine event; selecting the next
    // scheduled value is the state transition this effect synchronizes.
    setResolvedExercise(nextExercise({ preferId: next.exerciseId }))
  }, [
    calibrating,
    runner,
    gameState,
    sessionClockMs,
    sessionDurationMs,
    exercise,
  ])

  useEffect(() => {
    if (
      calibrating ||
      sessionClockMs < sessionDurationMs ||
      gameState !== "playing"
    )
      return

    const shares = assistanceRef.current
    const currentSteps = exerciseCompletionHandledRef.current
      ? 0
      : runner.completed
    const currentEscaped = exerciseCompletionHandledRef.current
      ? 0
      : runner.escaped
    const stats: CompletedSessionStats = {
      wpm,
      accuracy,
      elapsedTime: sessionElapsedTime,
      errors: totalErrors,
      stepsCompleted: completedStepsRef.current + currentSteps,
      stepsEscaped: escapedStepsRef.current + currentEscaped,
      assistance:
        shares.length === 0
          ? 0
          : shares.reduce((total, share) => total + share, 0) / shares.length,
    }

    // The sequence ending is an engine fact arriving from outside React, and
    // "the run is over" is genuinely new state rather than something
    // derivable during render — the figures are a frozen record of a run
    // that has stopped moving.
    setFinished(stats)
    setGameState("finished")
    onSessionCompleteRef.current?.(stats)
  }, [
    calibrating,
    sessionClockMs,
    sessionDurationMs,
    runner.completed,
    runner.escaped,
    gameState,
    wpm,
    accuracy,
    sessionElapsedTime,
    totalErrors,
  ])

  const handleStart = useCallback((): void => {
    clockStartedAtRef.current = performance.now()
    setSessionClockMs(0)
    setGameState("playing")
    start()
    // The keystroke-capture element only accepts input while enabled, and it
    // is enabled by the state change above — so focus has to wait a frame.
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [start])

  const handleAgain = useCallback((): void => {
    assistanceRef.current = []
    completedStepsRef.current = 0
    escapedStepsRef.current = 0
    setSessionClockMs(0)
    clockStartedAtRef.current = null
    exerciseCompletionHandledRef.current = false
    setFinished(null)
    setCompletedRationale(null)
    if (exercise === undefined) {
      const nextSeed =
        sessionSeed ?? crypto.getRandomValues(new Uint32Array(1))[0]!
      const first = takeScheduledExercise(
        SESSION_EXERCISE_IDS,
        createExerciseSchedule(SESSION_EXERCISE_IDS, nextSeed)
      )
      scheduleRef.current = first.schedule
      setResolvedExercise(nextExercise({ preferId: first.exerciseId }))
    } else {
      runner.restart()
    }
    setGameState("idle")
  }, [exercise, runner, sessionSeed])

  if (error) {
    return (
      <div
        className={cn(
          appearanceClassName(appearance),
          "absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
        )}
      >
        <p className="text-sm font-medium text-destructive">
          The typing engine could not start.
        </p>
        <p className="max-w-prose text-xs text-muted-foreground">
          {error.message}
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        appearanceClassName(appearance),
        "absolute inset-0 flex flex-col gap-3 overflow-hidden"
      )}
    >
      {finished ? (
        <ResultsCard
          exerciseTitle="LeetType session"
          stats={finished}
          onPlayAgain={handleAgain}
        />
      ) : (
        <>
          <ExerciseHeader
            title={calibrating ? "Warm-up" : resolvedExercise.title}
            elapsedTime={sessionElapsedTime}
            wpm={wpm}
            accuracy={accuracy}
          />

          <div className="relative flex min-h-0 flex-1 flex-col">
            <ExerciseCard
              step={step}
              index={calibrating ? 0 : runner.index}
              total={calibrating ? 1 : runner.total}
              attempt={attempt}
              displaySource={layout.displaySource}
              roles={roles}
              slotOfDisplay={slotOfDisplay}
              slotStatus={slotStatus}
              visibility={shownVisibility}
              cursorDisplay={cursorDisplay}
              manualRevealActive={shownManualRevealActive}
              manualRevealFraction={shownManualRevealFraction}
              rejection={rejection}
              gameState={gameState}
              onKey={recordKeystroke}
              onBackspace={backspace}
              onToggleReveal={toggleReveal}
              inputRef={inputRef}
              textGradient={textGradient}
            />

            <div className="pointer-events-none absolute inset-x-4 top-4 z-10">
              <div className="pointer-events-auto">
                <TypingErrorAlert
                  consecutiveErrors={consecutiveErrors}
                  onDismiss={onDismiss}
                  showErrorAlert={showErrorAlert}
                />
              </div>
            </div>

            {gameState === "idle" && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
                <Button onClick={handleStart} disabled={isLoading} size="lg">
                  {isLoading ? "Warming up…" : "Begin"}
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {completedRationale && (
        // LTY-WHY W4 (#1104): strictly-after, never gating. Rendered
        // outside the finished/in-progress split on purpose: the last
        // step of a sequence can carry rationaleChoices too, and its
        // completion effect fires in the same tick runner.advance() marks
        // the whole run finished — swapping ExerciseCard for ResultsCard
        // the instant it did (review finding on this PR) would make that
        // one accordion permanently unreachable. Anchored to the bottom
        // of the outer card either way, so it reads as one lingering
        // affordance about the step just finished, not a modal over
        // whichever surface happens to be showing.
        <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10">
          <div className="pointer-events-auto">
            <RationaleAccordion
              key={completedRationale.key}
              candidates={completedRationale.candidates}
            />
          </div>
        </div>
      )}
    </div>
  )
}
