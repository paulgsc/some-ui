import type { FC } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { ExerciseCard } from "@leetype/components/typing-game/exercise-card"
import { ExerciseHeader } from "@leetype/components/typing-game/exercise-header"
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
import { nextExercise } from "@leetype/lib/leetype/exercises"
import type { Exercise } from "@leetype/types/exercise"
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
   * The exercise to play. Defaults to whatever the shim hands out.
   *
   * This prop is the seam a future generator plugs into — see
   * `lib/leetype/exercises`. Everything above it (the runner, the card, the
   * engine) is indifferent to where the value came from.
   */
  exercise?: Exercise
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
 * in it. There is no challenge picker, no session configuration, no clock
 * that ends anything and no XP: what used to be six decisions the player
 * made before starting are now one decision the exercise engine makes, and
 * one scalar — WPM against their own baseline — that decides the rest.
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
  textGradient,
  onSessionComplete,
  appearance = "inherit",
}) => {
  // The shim is consulted once per mount rather than on every render: it is
  // synchronous and cheap, but "which exercise am I playing" must not change
  // underneath a run.
  const [resolvedExercise] = useState<Exercise>(
    () => exercise ?? nextExercise()
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
  const stepKey = calibrating ? "warm-up" : `${runner.index}:${runner.step.id}`
  const attempt = calibrating ? 0 : runner.attempt

  const {
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
  } = snapshot

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    warmUpIntervals,
    correct,
    assisted,
    elapsedTime,
    runner,
    readProgression,
    calibrate,
  ])

  useEffect(() => {
    if (calibrating || !runner.isFinished || gameState !== "playing") return

    const shares = assistanceRef.current
    const stats: CompletedSessionStats = {
      wpm,
      accuracy,
      elapsedTime: sessionElapsedTime,
      errors: totalErrors,
      stepsCompleted: runner.completed,
      stepsEscaped: runner.escaped,
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
    runner.isFinished,
    runner.completed,
    runner.escaped,
    gameState,
    wpm,
    accuracy,
    sessionElapsedTime,
    totalErrors,
  ])

  const handleStart = useCallback((): void => {
    setGameState("playing")
    start()
    // The keystroke-capture element only accepts input while enabled, and it
    // is enabled by the state change above — so focus has to wait a frame.
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [start])

  const handleAgain = useCallback((): void => {
    assistanceRef.current = []
    setFinished(null)
    runner.restart()
    setGameState("idle")
  }, [runner])

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
          exerciseTitle={resolvedExercise.title}
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
              roles={roles}
              slotOfDisplay={slotOfDisplay}
              slotStatus={slotStatus}
              visibility={shownVisibility}
              cursorDisplay={cursorDisplay}
              rejection={rejection}
              gameState={gameState}
              onKey={recordKeystroke}
              onBackspace={backspace}
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
    </div>
  )
}
