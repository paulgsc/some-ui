import type { FC } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ClaimChoices } from "@leetype/components/reading-game/claim-choices"
import { DiffCard } from "@leetype/components/reading-game/diff-card"
import { ReadingFeedback } from "@leetype/components/reading-game/reading-feedback"
import { ReadingHeader } from "@leetype/components/reading-game/reading-header"
import { useExerciseRunner } from "@leetype/hooks/leetype/use-exercise-runner"
import { SESSION_STEPS } from "@leetype/lib/leetype/exercises"
import {
  claimPoolOf,
  readingHunkOf,
  readingProbeOf,
} from "@leetype/lib/leetype/reading-probe"
import type { Exercise } from "@leetype/types/exercise"
import { Button } from "@some-ui/shared"
import { cn } from "some-ui-utils"

/**
 * Mixed into the session seed per step so two steps in one session never draw
 * the same distractor ordering, while a replayed seed still reproduces both.
 * A large odd constant, the ordinary way to decorrelate a counter before it
 * reaches a generator.
 */
const STEP_SEED_STRIDE = 0x9e3779b9

type ReadingSessionProps = {
  /** Which exercise this session plays, resolved by `Leetype` before mount. */
  exercise: Exercise
  /** Session term supplied by the composer/scene, in milliseconds. */
  sessionDurationMs?: number
  /** Deterministic override for tests, previews, and replaying a distractor-ordering bug. */
  sessionSeed?: number
  /** Fired once the term is spent or the fixed exercise runs out. */
  onSessionComplete?: () => void
  className?: string
}

/**
 * The session itself (Prop. 9.2): read one change, say what it does, read
 * why. `Leetype` mounts this whenever the viewport is narrow; it is a
 * complete design, not a lesser `TypingSession`.
 *
 * Same corpus, runner and `ExercisePicker` as `TypingSession`, different
 * probe: this one asks the player to *discriminate* a change's claim from
 * the corpus's claims about other changes (`lib/leetype/reading-probe`);
 * `TypingSession` is the optional production probe used instead on wide
 * viewports. Never both mounted. Discrimination needs no input modality,
 * which is why it is always available.
 *
 * No engine: `useTypingGame` is never called, so `@some-ui/leetype-wasm` is
 * never fetched and engine invariants stay untouched by this surface. No
 * baseline sample, WPM, gate, reveal window, attempt counter or warm-up:
 * those measure production. Nothing here reaches `baseline-store`,
 * `calibrate`, `weightedWpm` or `gateThreshold` (`p_credited = false`, as
 * LTY-SEAM).
 *
 * One vertical scroll, and it is the page: a single column, with only
 * `DiffCard`'s code region scrolling (horizontally).
 */
export const ReadingSession: FC<ReadingSessionProps> = ({
  exercise,
  sessionDurationMs = 10 * 60_000,
  sessionSeed,
  onSessionComplete,
  className,
}) => {
  const [seed] = useState(
    () => sessionSeed ?? crypto.getRandomValues(new Uint32Array(1))[0]!
  )
  const runner = useExerciseRunner(exercise)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [sessionClockMs, setSessionClockMs] = useState(0)
  /** Bumped by `handleRestart` to re-anchor the session clock at a fresh mount-like start. */
  const [sessionGeneration, setSessionGeneration] = useState(0)

  const onSessionCompleteRef = useRef(onSessionComplete)
  useEffect(() => {
    onSessionCompleteRef.current = onSessionComplete
  }, [onSessionComplete])

  /** Every claim the eligible corpus makes, computed once (see `claimPoolOf`). */
  const pool = useMemo(() => claimPoolOf(SESSION_STEPS), [])

  const step = runner.step
  const hunk = useMemo(() => readingHunkOf(step), [step])
  const probe = useMemo(
    () =>
      readingProbeOf(
        step,
        pool,
        (seed ^ Math.imul(runner.index + 1, STEP_SEED_STRIDE)) >>> 0
      ),
    [step, pool, seed, runner.index]
  )

  useEffect(() => {
    // Anchored at mount, not at a first tap, for the reason `TypingSession`'s
    // own clock is: the orchestrator removes this scene at its own
    // `start_time + duration`, measured from when the scene became active.
    const startedAt = performance.now()
    const update = (): void => {
      setSessionClockMs(
        Math.min(performance.now() - startedAt, sessionDurationMs)
      )
    }
    update()
    const timer = window.setInterval(update, 250)
    return (): void => window.clearInterval(timer)
  }, [sessionDurationMs, sessionGeneration])

  useEffect(() => {
    if (finished || sessionClockMs < sessionDurationMs) return
    // The term running out is an external fact owned by the orchestrator's
    // clock, and "the run is over" is new state, not derivable in render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFinished(true)
    onSessionCompleteRef.current?.()
  }, [finished, sessionClockMs, sessionDurationMs])

  const handleNext = useCallback((): void => {
    setSelectedId(null)
    setSubmitted(false)
    setReviewed((count) => count + 1)

    if (!runner.isFinished) {
      // The reading path never repeats or escapes a step: there is no gate to
      // fall short of, so the only progression it can report is "advance."
      runner.advance("advance")
    }

    const lastStep = runner.index >= runner.total - 1
    if (!lastStep) return

    // A session is exactly one exercise: `Leetype` resolves which one before
    // this component ever mounts, so finishing it ends the term.
    setSessionClockMs(sessionDurationMs)
  }, [runner, sessionDurationMs])

  const handleRestart = useCallback((): void => {
    setSelectedId(null)
    setSubmitted(false)
    setFinished(false)
    setReviewed(0)
    setSessionClockMs(0)
    setSessionGeneration((generation) => generation + 1)
    runner.restart()
  }, [runner])

  if (finished) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-4 px-4 text-center",
          className
        )}
      >
        <div>
          <p className="text-base font-medium text-foreground">
            Session complete
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {reviewed} {reviewed === 1 ? "change" : "changes"} reviewed
          </p>
        </div>
        <Button onClick={handleRestart} size="lg">
          Restart
        </Button>
      </div>
    )
  }

  return (
    <div
      data-scroll-intent="reading-page"
      className={cn(
        // scroll-intent: reading-page — this surface *is* the page on a
        // phone, and the one vertical scroll the ui-fit doctrine allows a
        // screen to have. Every alternative the doctrine prefers fails here
        // on its own terms: tabs would separate the hunk from the question
        // asked about it, paging would hide the code behind the answer the
        // learner is reasoning from, and the box cannot be enlarged because
        // it is a phone. Nothing nested inside scrolls vertically; only
        // `DiffCard`'s code region scrolls, and only horizontally.
        //
        // `max-w-lg` centred rather than a second layout: a tablet or a
        // desktop preview gets the same surface with air around it, never a
        // split pane grown out of a phone card.
        "mx-auto flex h-full w-full max-w-lg flex-col gap-4 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
        className
      )}
    >
      <ReadingHeader position={runner.index + 1} total={runner.total} />

      {/* Every child is `shrink-0`: in this fixed-height scroll column a
          shrinkable `DiffCard` would clip its added line just as the
          explanation appears below it. */}
      <div className="flex min-w-0 shrink-0 flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Read the change
        </p>
        {/* `text-base`: the hunk is the object, the title only labels it.
            Hidden on a `goal` probe, whose answer *is* the goal. */}
        {probe.family !== "goal" && (
          <h2 className="text-pretty text-base font-semibold leading-snug text-foreground">
            {step.goal}
          </h2>
        )}
        {step.concepts.length > 0 && (
          <p className="text-xs text-muted-foreground/70">
            {step.concepts.join(" · ")}
          </p>
        )}
      </div>

      {hunk && <DiffCard hunk={hunk} className="shrink-0" />}

      <ClaimChoices
        // Keyed by step: fresh unchecked inputs per step, no clearing effect.
        key={`${exercise.id}:${step.id}`}
        prompt={probe.prompt}
        options={probe.options}
        selectedId={selectedId}
        onSelect={setSelectedId}
        answerId={submitted ? probe.answerId : null}
        className="shrink-0"
      />

      {submitted && probe.justification !== undefined && (
        <ReadingFeedback
          justification={probe.justification}
          className="shrink-0"
        />
      )}

      {/* In the flow, not sticky: a sticky footer would cover the answers. */}
      <div className="shrink-0 pb-2 pt-1">
        {submitted ? (
          <Button className="w-full" size="lg" onClick={handleNext}>
            Next change
          </Button>
        ) : (
          <Button
            className="w-full"
            size="lg"
            disabled={selectedId === null}
            onClick={() => setSubmitted(true)}
          >
            Check answer
          </Button>
        )}
      </div>
    </div>
  )
}
