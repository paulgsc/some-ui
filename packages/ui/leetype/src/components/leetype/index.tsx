import type { FC } from "react"
import { useCallback, useState } from "react"
import type { ExercisePickerBadge } from "@leetype/components/exercise-picker"
import { ExercisePicker } from "@leetype/components/exercise-picker"
import { ReadingSession } from "@leetype/components/reading-game/reading-session"
import { TypingSession } from "@leetype/components/typing-game/typing-session"
import {
  nextExercise,
  SESSION_EXERCISE_IDS,
} from "@leetype/lib/leetype/exercises"
import type { Exercise } from "@leetype/types/exercise"
import type {
  CompletedSessionStats,
  TextGradient,
} from "@leetype/types/leetype"
import type { Appearance } from "@some-ui/styles/theme"
import { appearanceClassName } from "@some-ui/styles/theme"
import { cn, useIsMobile } from "some-ui-utils"

/**
 * Which probe the player gets.
 *
 * `"auto"` — the default, and what every host should pass — reads the
 * viewport. The two explicit values exist for a story, a test, or a deep link
 * that means one surface specifically; they are not a user-facing setting and
 * nothing in `apps/www` sets one.
 */
export type LeetypeSurface = "auto" | "typing" | "reading"

/** Matches `TypingSession`/`ReadingSession`'s own default — see why below at `mountedAt`. */
const DEFAULT_SESSION_DURATION_MS = 10 * 60_000

type LeetypeProps = {
  /**
   * A fixed exercise for a preview or deep link. Normal sessions omit this
   * prop: the learner chooses one from `ExercisePicker` instead, and the
   * choice — not a schedule — decides what plays.
   *
   * This prop is the seam a future generator plugs into — see
   * `lib/leetype/exercises`. Everything above it is indifferent to where the
   * value came from, on either surface.
   */
  exercise?: Exercise
  /** Session term supplied by the composer/scene, in milliseconds. */
  sessionDurationMs?: number
  /** Deterministic override for tests, previews, and replaying an ordering bug. */
  sessionSeed?: number
  /** Cosmetic, and typing-only: the reading surface paints no gradient over code. */
  textGradient?: TextGradient
  /**
   * Called once the whole sequence is finished.
   *
   * `stats` is present only on the typing surface. The reading surface
   * produces no WPM, no accuracy and no assistance share — those are facts
   * about production measured through keystroke timing, and it has no
   * keystrokes — so it reports completion with nothing attached rather than
   * with zeroes a caller would be entitled to read as measurements.
   */
  onSessionComplete?: (stats?: CompletedSessionStats) => void
  /** Art direction. See `TypingSession` for the full note; `inherit` is the default. */
  appearance?: Appearance
  /** Escape hatch for stories, tests and deep links. Defaults to `"auto"`. */
  surface?: LeetypeSurface
  /**
   * Per-exercise usage signal for `ExercisePicker`'s tiles — how starved or
   * popular each one is, in whatever units the host's own session history
   * counts in. Optional and computed by nobody here: this package's static
   * seed corpus has no notion of "across every player, over time," so a host
   * that tracks that (`apps/www`) supplies it; a host that doesn't gets a
   * plain, badge-free picker.
   */
  exerciseBadges?: Readonly<Record<string, ExercisePickerBadge>>
}

/**
 * LeetType: a competency probe, on whichever channel the device actually has.
 *
 * ```text
 * Leetype                         picks a modality, then an exercise
 * ├── ExercisePicker               no exercise chosen yet (either surface)
 * ├── TypingSession   ≥ 768px      produce the witness  (the M20 surface)
 * └── ReadingSession  < 768px      discriminate the claim (LTY-MOBILE)
 * ```
 *
 * # Why a branch here rather than responsive CSS one level down
 *
 * Because the two session surfaces are not the same interaction at two
 * widths. The typing surface's reveal loop, gate, baseline sampling and WPM
 * figures are all facts about a player producing code under time pressure;
 * on a phone there is no keyboard to produce it with, and every one of those
 * figures measures a channel that is switched off. Reflowing that surface
 * into a narrow column yields a screen that *looks* playable and reports
 * numbers that mean nothing — which is worse than not offering it.
 *
 * So the breakpoint is not `desktop diff → smaller desktop diff`. It is
 * `production probe → discrimination probe`, and expressing it as a component
 * branch rather than a media query is what lets the mobile path mount none of
 * the engine: `TypingSession` is where `useTypingGame` lives, and a hook
 * cannot be called conditionally. A phone therefore never fetches
 * `@some-ui/leetype-wasm` at all. `ExercisePicker` makes its own, independent
 * mobile/desktop choice for the same reason applied to itself: a picker built
 * for a pointer and one built for a thumb are different layouts.
 *
 * # The breakpoint is `useIsMobile`'s, not a new one
 *
 * 768px, from `some-ui-utils`. Reused rather than re-picked: the workspace
 * already has exactly one answer to "is this a phone," and a second constant
 * here would be a second answer that drifts. It reads the media query through
 * `useSyncExternalStore`, so the first render already has the right surface
 * instead of painting the wrong one and correcting a frame later — which on
 * this component would mean starting a wasm load for a session that turns out
 * to be a reading one.
 *
 * # Choosing an exercise replaced choosing one at random
 *
 * There used to be a seeded schedule here (`lib/leetype/exercises
 * /scheduling.ts`) that traversed the eligible corpus in a shuffled cycle
 * whenever no `exercise` prop was supplied. It is gone, not superseded: a
 * learner picking their own target is a stronger reason to come back than a
 * well-shuffled bag, and it is the only way to go straight at a concept
 * known to be weak. `picked` below is this component's whole memory of that
 * choice — cleared back to "no exercise yet" once a picker-sourced session
 * finishes, so the next round asks again rather than silently looping to
 * another random one. An explicit `exercise` prop (deep link, preview,
 * test) always wins and never sees the picker at all.
 *
 * `picked` also carries the session's remaining time budget, snapshotted at
 * the moment of selection — see `mountedAt` below for why time spent
 * browsing the picker has to come out of that budget rather than being
 * free.
 *
 * # The registry contract
 *
 * Mounts with no props and no ambient context, exactly as before
 * (`@some-ui/content-registry`'s own rule). A host binds `leetype` and gets
 * whichever surface the device can actually carry, without knowing there are
 * two — and, with no `exercise` forced, the learner sees the picker first.
 */
export const Leetype: FC<LeetypeProps> = ({
  exercise,
  sessionDurationMs = DEFAULT_SESSION_DURATION_MS,
  sessionSeed,
  textGradient,
  onSessionComplete,
  appearance = "inherit",
  surface = "auto",
  exerciseBadges,
}) => {
  const isMobile = useIsMobile()
  const resolved =
    surface === "auto" ? (isMobile ? "reading" : "typing") : surface

  /**
   * The orchestrator removes this whole component at its own mount time
   * plus `sessionDurationMs` (see `TypingSession`'s own clock-anchoring
   * comment) — a deadline fixed the instant `Leetype` itself mounts, before
   * the learner has picked anything. Time spent browsing the picker
   * therefore has to come out of the session's own budget: without this,
   * a session picked late could be unmounted by the orchestrator before its
   * own completion effect ever runs, and `onSessionComplete` would silently
   * never fire (review finding on some-ui#1182).
   */
  const [mountedAt] = useState(() => performance.now())

  // Both the id and the remaining budget are snapshotted once, at the
  // moment of selection — not recomputed on every render, which would keep
  // shrinking the child session's `sessionDurationMs` prop on every
  // unrelated re-render and re-anchor its clock forever.
  const [picked, setPicked] = useState<
    { id: string; remainingMs: number } | undefined
  >(undefined)

  const handleSelect = useCallback(
    (id: string): void => {
      const elapsed = performance.now() - mountedAt
      setPicked({ id, remainingMs: Math.max(0, sessionDurationMs - elapsed) })
    },
    [mountedAt, sessionDurationMs]
  )

  const active: Exercise | undefined =
    exercise ?? (picked ? nextExercise({ preferId: picked.id }) : undefined)
  // An explicit `exercise` prop is the caller's own fixed seam (a preview, a
  // deep link, a test): the scene became active exactly when this mounted,
  // so no picker-time gap exists and the raw duration is already correct.
  const activeDurationMs =
    exercise !== undefined ? sessionDurationMs : (picked?.remainingMs ?? 0)

  // Only a picker-sourced choice returns to the picker on completion — an
  // explicit `exercise` prop keeps behaving exactly as it always has.
  const handleComplete = useCallback(
    (stats?: CompletedSessionStats): void => {
      onSessionComplete?.(stats)
      if (exercise === undefined) setPicked(undefined)
    },
    [onSessionComplete, exercise]
  )

  if (!active) {
    const items = SESSION_EXERCISE_IDS.map((id) => {
      const { title } = nextExercise({ preferId: id })
      return { id, title, badge: exerciseBadges?.[id] }
    })
    return (
      <div className={cn(appearanceClassName(appearance), "absolute inset-0")}>
        <ExercisePicker items={items} onSelect={handleSelect} />
      </div>
    )
  }

  if (resolved === "reading") {
    return (
      <div className={cn(appearanceClassName(appearance), "absolute inset-0")}>
        <ReadingSession
          exercise={active}
          sessionDurationMs={activeDurationMs}
          sessionSeed={sessionSeed}
          onSessionComplete={(): void => handleComplete()}
        />
      </div>
    )
  }

  return (
    <TypingSession
      exercise={active}
      sessionDurationMs={activeDurationMs}
      textGradient={textGradient}
      onSessionComplete={handleComplete}
      appearance={appearance}
    />
  )
}
