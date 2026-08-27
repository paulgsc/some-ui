import type { FC } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ClaimChoices } from "@leetype/components/reading-game/claim-choices"
import { DiffCard } from "@leetype/components/reading-game/diff-card"
import { ReadingFeedback } from "@leetype/components/reading-game/reading-feedback"
import { ReadingHeader } from "@leetype/components/reading-game/reading-header"
import { useExerciseRunner } from "@leetype/hooks/leetype/use-exercise-runner"
import {
  nextExercise,
  SESSION_EXERCISE_IDS,
  SESSION_STEPS,
} from "@leetype/lib/leetype/exercises"
import {
  createExerciseSchedule,
  takeScheduledExercise,
} from "@leetype/lib/leetype/exercises/scheduling"
import type { ExerciseSchedule } from "@leetype/lib/leetype/exercises/scheduling"
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
  /** A fixed exercise for a preview or deep link, exactly as `TypingSession` takes one. */
  exercise?: Exercise
  /** Session term supplied by the composer/scene, in milliseconds. */
  sessionDurationMs?: number
  /** Deterministic override for tests, previews, and replaying an ordering bug. */
  sessionSeed?: number
  /** Fired once the term is spent or the fixed exercise runs out. */
  onSessionComplete?: () => void
  className?: string
}

/**
 * The small-screen surface (LTY-MOBILE): read one change, say what it does,
 * read why.
 *
 * # What this is, next to `TypingSession`
 *
 * The same corpus, the same runner, the same scheduler — and a different
 * probe. Desktop asks the player to *produce* the witness under a masking
 * loop; there is no version of that which survives a phone keyboard, so this
 * surface asks them to *discriminate* the claim the change makes from claims
 * the corpus makes about other changes (`lib/leetype/reading-probe`).
 *
 * The slogan the decision record opens with is what licenses this: *the game
 * is not a typing game over source code; it is a competency probe whose only
 * input modality happens to be typing.* On a 390px viewport that modality is
 * unavailable, so it is the modality that changes and not the subject.
 *
 * # What this surface deliberately does not have
 *
 * No engine. `useTypingGame` is never called here, so `@some-ui/leetype-wasm`
 * is never fetched on a phone — a fact worth more than the bundle it saves,
 * because it means every engine invariant (`cargo test -p leetype_wasm`)
 * remains a statement about a system this surface cannot perturb.
 *
 * No baseline sample, no WPM, no gate, no reveal window, no attempt counter.
 * Every one of those is a fact about production, measured through keystroke
 * timing; there are no keystrokes. A discrimination answer is never blended
 * into `baseline-store`, never reaches `calibrate`, and never moves
 * `weightedWpm` or `gateThreshold` — the `p_credited = false` posture
 * LTY-SEAM already holds for the whole exercise (#1015), inherited rather
 * than re-argued for a weaker channel.
 *
 * No warm-up. Calibration exists to sample a player's copying speed, and this
 * surface has nothing to calibrate.
 *
 * # One vertical scroll, and it is the page
 *
 * The shell is a single column: header, hunk, question, answers, action. Only
 * the code region scrolls horizontally (`DiffCard`), and nothing nests a
 * second vertical scroller — `docs/ui-fit`'s rule, and the one surface where
 * a nested scrollbar under a thumb would be worst.
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
  const [initialSelection] = useState(() =>
    takeScheduledExercise(
      SESSION_EXERCISE_IDS,
      createExerciseSchedule(SESSION_EXERCISE_IDS, seed)
    )
  )
  const scheduleRef = useRef<ExerciseSchedule>(initialSelection.schedule)
  const [resolvedExercise, setResolvedExercise] = useState<Exercise>(
    () => exercise ?? nextExercise({ preferId: initialSelection.exerciseId })
  )
  const runner = useExerciseRunner(resolvedExercise)

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

  /**
   * Every claim the eligible corpus makes, computed once. The pool is the
   * whole corpus rather than the exercise in flight: an exercise's steps are
   * three or four sentences about one concept, so distractors drawn from
   * inside it would be arbitrary rather than discriminating, and there would
   * rarely be three of them.
   */
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
    // The term running out is an external fact — a wall clock the
    // orchestrator, not React, owns — and "the run is over" is genuinely new
    // state rather than something derivable during render: the completion
    // screen reports a count of a run that has stopped moving. The same shape
    // and the same justification `TypingSession`'s own end-of-session effect
    // carries.
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

    if (exercise !== undefined) {
      // The fixed-exercise seam is one exercise long, the same contract
      // `TypingSession` honours for a preview or deep link.
      setSessionClockMs(sessionDurationMs)
      return
    }

    const next = takeScheduledExercise(
      SESSION_EXERCISE_IDS,
      scheduleRef.current
    )
    scheduleRef.current = next.schedule
    setResolvedExercise(nextExercise({ preferId: next.exerciseId }))
  }, [runner, exercise, sessionDurationMs])

  const handleRestart = useCallback((): void => {
    setSelectedId(null)
    setSubmitted(false)
    setFinished(false)
    setReviewed(0)
    setSessionClockMs(0)
    setSessionGeneration((generation) => generation + 1)
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
  }, [exercise, runner, sessionSeed])

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

      {/* Every child of this column is `shrink-0`. The column is a scroll
          container with a definite height, so a flex child left at the
          default `flex-shrink: 1` gets compressed as its siblings grow — and
          `DiffCard` clips rather than scrolls vertically, which meant the
          added line vanished out of the card at the exact moment the
          explanation panel appeared below it. Losing the line the learner is
          reasoning about, precisely when they are reading why it is right,
          is the worst version of that bug this surface could have. */}
      <div className="flex min-w-0 shrink-0 flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Read the change
        </p>
        {/* `text-base`, not the display size a title usually gets. The hunk is
            the object being inspected and the title is a label on it; a
            heading that outweighs the code turns the screen into a quiz that
            contains a diff rather than a diff inspection that asks a
            question.

            Suppressed entirely on a `goal` probe. Such a step carries neither
            a `rationale` nor an `obligation`, so its claim *is* its goal —
            printing that goal here would put the answer above four options
            one of which repeats it word for word, which is not a hard card,
            it is not a card at all. */}
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
        // Keyed by step so a fresh group — and a fresh set of unchecked
        // inputs — mounts per step, rather than an effect racing to clear the
        // previous one's checked state.
        key={`${resolvedExercise.id}:${step.id}`}
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

      {/* Follows the content rather than pinning to the bottom. A sticky
          footer would sit over the answers on a short card and over the
          keyboard-adjacent area on a tall one, and the column already
          scrolls — so the action is simply the last thing in the flow. */}
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
