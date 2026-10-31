import type { FC } from "react"
import { useCallback, useRef, useState } from "react"
import { ExerciseCard } from "@leetype/components/typing-game/exercise-card"
import { ExerciseHeader } from "@leetype/components/typing-game/exercise-header"
import { RationaleAccordion } from "@leetype/components/typing-game/rationale-accordion"
import { ResultsCard } from "@leetype/components/typing-game/results-card"
import { TypingErrorAlert } from "@leetype/components/typing-game/typing-error-alert"
import { useExerciseRunner } from "@leetype/hooks/leetype/use-exercise-runner"
import { useKeystrokeIntervals } from "@leetype/hooks/leetype/use-keystroke-intervals"
import { useTerm } from "@leetype/hooks/leetype/use-term"
import { useTypingGame } from "@leetype/hooks/leetype/use-typing-game-wasm"
import type { Baseline } from "@leetype/lib/leetype/baseline-store"
import {
  blendBaseline,
  loadBaseline,
  sampleFromIntervals,
  saveBaseline,
} from "@leetype/lib/leetype/baseline-store"
import { CALIBRATION_STEP } from "@leetype/lib/leetype/baseline-store/calibration"
import type { Exercise, RationaleChoice } from "@leetype/types/exercise"
import { typingBlockOf } from "@leetype/types/exercise"
import type {
  CompletedSessionStats,
  GameState,
  Snapshot,
  TextGradient,
} from "@leetype/types/leetype"
import { VISIBILITY_REVEALED } from "@leetype/types/leetype"
import { cn } from "@some-ui/core-utils"
import type { ActivityHost } from "@some-ui/react-hooks"
import { Button } from "@some-ui/shared"
import type { Appearance } from "@some-ui/styles/theme"
import { appearanceClassName } from "@some-ui/styles/theme"

/**
 * A baseline sample from one finished step: its mean inter-keystroke
 * interval repeated once per resolved slot, since a step reports only a
 * total. Weaker than a calibration run, which suits the slow blend. A step
 * too short to say anything returns `null`.
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

type TypingSessionProps = {
  /**
   * Which exercise this session plays, resolved by `Leetype` (a fixed prop or
   * the `ExercisePicker` choice). The seam a generator plugs into (see
   * `lib/leetype/exercises`); nothing below cares where it came from.
   */
  exercise: Exercise
  /** Session term supplied by the composer/scene, in milliseconds. */
  sessionDurationMs?: number
  /** The session around it: the term waits while it waits (`useTerm`). */
  host?: ActivityHost
  /** Cosmetic. See `TextGradient`. */
  textGradient?: TextGradient
  /** Called once the whole sequence is finished. */
  onSessionComplete?: (stats: CompletedSessionStats) => void
  /**
   * Art direction. `inherit` (default) renders in the host's theme. A host
   * wanting the vim-night editor surface passes `appearance="code"`, which
   * reassigns `--background`/`--foreground` for the subtree.
   */
  appearance?: Appearance
}

/**
 * The production probe (Prop. 9.2): a competency probe whose input is
 * typing, rendered on viewports wide enough for a keyboard *instead of*
 * rounds. `Leetype` mounts exactly one of the two, so neither mounts the
 * other's hooks.
 *
 * The loop is *read one sentence → type → observe → repeat*, with no menu
 * inside it and no XP. This component composes three collaborators, each
 * ignorant of the others:
 *
 * - `useExerciseRunner`: which step, and when to leave it. No typing state.
 * - `useTypingGame`: slots, caret, reveal, the two WPM figures. No idea
 *   what a step is.
 * - `ExerciseCard`: draws one step against those projections.
 *
 * Their seam is the single `advance` call below. Per Ax. 9.1 (revelation is
 * unconditional) `readProgression` always answers `"advance"`.
 */
export const TypingSession: FC<TypingSessionProps> = ({
  exercise,
  sessionDurationMs = 10 * 60_000,
  host,
  textGradient,
  onSessionComplete,
  appearance = "inherit",
}) => {
  const runner = useExerciseRunner(exercise)

  const [gameState, setGameState] = useState<GameState>("idle")
  /**
   * A player with no stored baseline warms up first: the same surface with
   * nothing masked or gated. The runner never sees it; it proves no
   * competency. A player without one still plays on the cold-start stand-in.
   */
  const [phase, setPhase] = useState<"calibrating" | "exercise">(() =>
    loadBaseline() === null ? "calibrating" : "exercise"
  )
  /** Set once, when the sequence ends: a frozen record of a finished run. */
  const [finished, setFinished] = useState<CompletedSessionStats | null>(null)

  /**
   * The most recently completed step's `rationaleChoices` (LTY-WHY W4), as a
   * frozen copy: the keystroke that finishes a step also advances the
   * runner, so nothing keyed off `runner.step` ever renders as both complete
   * and current.
   *
   * Cleared on the player's *next* keystroke (`recordKeystroke`), not by an
   * effect on `stepKey`: `stepKey` changes in the same update that sets
   * this, so such an effect would clear it before it ever painted.
   */
  const [completedRationale, setCompletedRationale] = useState<{
    key: string
    candidates: ReadonlyArray<RationaleChoice>
  } | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)

  /**
   * The player's sampled speed at mount, read once to construct the engine;
   * later samples reach it through `calibrate`, not a re-render.
   */
  const [initialBaseline] = useState<Baseline | null>(() => loadBaseline())
  const baselineRef = useRef<Baseline | null>(initialBaseline)
  /** Per-step assistance, banked as each step is left behind. */
  const assistanceRef = useRef<Array<number>>([])
  /**
   * Every warm-up interval, so the store gets a real distribution for its
   * trimmed mean and IQR (a repeated mean has zero dispersion).
   */
  const warmUpIntervals = useKeystrokeIntervals()

  const calibrating = phase === "calibrating"
  const step = calibrating ? CALIBRATION_STEP : runner.step
  const source = typingBlockOf(step)?.source ?? ""
  /** Which step this is, independent of its text (two steps may share a source). */
  const stepKey = calibrating
    ? "warm-up"
    : `${exercise.id}:${runner.index}:${runner.step.id}`
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
   * The warm-up's whole off switch: `CodeDisplay` owns no masking policy, so
   * an all-revealed map turns the reveal loop off with no mode flag.
   */
  const shownVisibility = calibrating
    ? new Uint8Array(visibility.length).fill(VISIBILITY_REVEALED)
    : visibility

  /** Ends the session: the run's record, shown and reported once. */
  const finish = useCallback(
    (last: Snapshot, stepsCompleted: number, stepsEscaped: number): void => {
      const shares = assistanceRef.current
      const stats: CompletedSessionStats = {
        wpm: last.wpm,
        accuracy: last.accuracy,
        elapsedTime: last.sessionElapsedTime,
        errors: last.totalErrors,
        stepsCompleted,
        stepsEscaped,
        assistance:
          shares.length === 0
            ? 0
            : shares.reduce((total, share) => total + share, 0) / shares.length,
      }
      setFinished(stats)
      setGameState("finished")
      onSessionComplete?.(stats)
    },
    [onSessionComplete]
  )

  const { hasExpired, restart: restartDeadline } = useTerm({
    durationMs: sessionDurationMs,
    host,
    onExpire: () => {
      // The warm-up proves nothing, so a term spent during it ends the
      // session when it does (see `recordKeystroke`), or at Begin.
      if (calibrating || gameState !== "playing") return
      finish(snapshot, runner.completed, runner.escaped)
    },
  })

  /**
   * One keystroke, and, when it finishes the step, everything that follows
   * from that: bank the assistance, feed the run into the baseline, and
   * advance (never a verdict, Ax. 9.1). Unconditional and click-free.
   */
  const recordKeystroke = useCallback(
    (key: string): void => {
      if (calibrating) warmUpIntervals.record()
      // Retires the accordion (see completedRationale).
      setCompletedRationale(null)
      const outcome = press(key)
      // Only the keystroke that finished the step carries a `chunk`.
      if (!outcome?.chunk) return
      const last = outcome.snapshot

      // The warm-up's sample is taken outright, not blended: the cold start
      // it replaces was a stand-in, not evidence.
      if (calibrating) {
        const sample = sampleFromIntervals(warmUpIntervals.read())
        if (sample) {
          baselineRef.current = sample
          saveBaseline(sample)
          calibrate(sample)
        }
        warmUpIntervals.reset()
        setPhase("exercise")
        if (hasExpired()) finish(last, runner.completed, runner.escaped)
        return
      }

      if (step.rationaleChoices !== undefined) {
        setCompletedRationale({
          key: stepKey,
          candidates: step.rationaleChoices,
        })
      }

      assistanceRef.current.push(
        last.correct > 0 ? last.assisted / last.correct : 0
      )

      // Every run feeds the sample, so a player who never calibrates still
      // converges on their own speed.
      const sample = sampleFromStep(last.elapsedTime, last.correct)
      if (sample) {
        const next = blendBaseline(baselineRef.current, sample)
        baselineRef.current = next
        saveBaseline(next)
        calibrate(next)
      }

      const progression = readProgression()
      runner.advance(progression)

      // A session is exactly one exercise: `Leetype` resolves which one
      // before this component ever mounts, so finishing it ends the term
      // rather than advancing to something else picked here.
      if (runner.index + 1 >= runner.total) {
        finish(
          last,
          runner.completed + 1,
          runner.escaped + (progression === "escape" ? 1 : 0)
        )
      }
    },
    [
      calibrating,
      warmUpIntervals,
      press,
      calibrate,
      hasExpired,
      finish,
      runner,
      step,
      stepKey,
      readProgression,
    ]
  )

  const {
    showErrorAlert,
    consecutiveErrors,
    cursorDisplay,
    sessionElapsedTime,
    wpm,
    accuracy,
    manualRevealActive,
    manualRevealFraction,
  } = snapshot

  /**
   * The warm-up already shows everything, so the reveal toggle's state is
   * suppressed here (`ExerciseCard` knows nothing of warm-ups).
   */
  const shownManualRevealActive = calibrating ? false : manualRevealActive
  const shownManualRevealFraction = calibrating ? 0 : manualRevealFraction

  const handleStart = useCallback((): void => {
    setGameState("playing")
    start()
    if (!calibrating && hasExpired()) {
      finish(snapshot, runner.completed, runner.escaped)
      return
    }
    // The keystroke-capture element only accepts input while enabled, and it
    // is enabled by the state change above — so focus has to wait a frame.
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [start, calibrating, hasExpired, finish, snapshot, runner])

  const handleAgain = useCallback((): void => {
    assistanceRef.current = []
    restartDeadline()
    setFinished(null)
    setCompletedRationale(null)
    runner.restart()
    setGameState("idle")
  }, [runner, restartDeadline])

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
            title={calibrating ? "Warm-up" : exercise.title}
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
        // LTY-WHY W4: strictly after, never gating. Outside the
        // finished/in-progress split so the last step's accordion survives
        // the swap to ResultsCard; anchored to the bottom, not a modal.
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
