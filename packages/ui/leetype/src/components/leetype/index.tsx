import type { FC } from "react"
import { useCallback, useEffect, useState } from "react"
import type { ExercisePickerBadge } from "@leetype/components/exercise-picker"
import { ExercisePicker } from "@leetype/components/exercise-picker"
import { ReadingSession } from "@leetype/components/reading-game/reading-session"
import { RoundSession } from "@leetype/components/round/round-session"
import { TypingSession } from "@leetype/components/typing-game/typing-session"
import { AUTHORED_ROUNDS } from "@leetype/lib/leetype/authored-rounds"
import {
  nextExercise,
  SESSION_EXERCISE_IDS,
} from "@leetype/lib/leetype/exercises"
import type { Dictation } from "@leetype/lib/leetype/notes/dictation"
import { lintAuthoredRounds } from "@leetype/lib/leetype/round-assembly"
import type { RoundRunsLoader } from "@leetype/lib/leetype/round-runs"
import type { Round } from "@leetype/types/authored-round"
import { RoundSchema } from "@leetype/types/authored-round"
import type { Exercise } from "@leetype/types/exercise"
import type {
  CompletedSessionStats,
  TextGradient,
} from "@leetype/types/leetype"
import type { ShelfPort } from "@some-ui/shared"
import type { Appearance } from "@some-ui/styles/theme"
import { appearanceClassName } from "@some-ui/styles/theme"
import { cn, useIsMobile } from "some-ui-utils"

/**
 * Which probe the player gets. `"auto"` (default, what hosts pass) reads the
 * viewport; the explicit values are for stories, tests and deep links.
 */
export type LeetypeSurface = "auto" | "reading" | "typing"

/** Matches `TypingSession`/`ReadingSession`'s own default — see why below at `mountedAt`. */
const DEFAULT_SESSION_DURATION_MS = 10 * 60_000

type LeetypeProps = {
  /**
   * A fixed exercise for a preview or deep link. Normal sessions omit it and
   * the learner picks from `ExercisePicker`. The seam a generator plugs into
   * (see `lib/leetype/exercises`).
   */
  exercise?: Exercise
  /** Session term supplied by the composer/scene, in milliseconds. */
  sessionDurationMs?: number
  /** Deterministic override for tests, previews, and replaying an ordering bug. */
  sessionSeed?: number
  /** Cosmetic, and typing-only: the reading surface paints no gradient over code. */
  textGradient?: TextGradient
  /**
   * Called once the whole sequence is finished. `stats` comes only from the
   * typing surface; the reading surface has no keystrokes to measure, so it
   * reports completion with nothing rather than misleading zeroes.
   */
  onSessionComplete?: (stats?: CompletedSessionStats) => void
  /** Art direction. See `TypingSession` for the full note; `inherit` is the default. */
  appearance?: Appearance
  /** Escape hatch for stories, tests and deep links. Defaults to `"auto"`. */
  surface?: LeetypeSurface
  /**
   * Per-exercise usage signal for `ExercisePicker`'s tiles, in the host's own
   * units. Supplied by a host that tracks usage (`apps/www`); absent, the
   * picker shows no badges.
   */
  exerciseBadges?: Readonly<Record<string, ExercisePickerBadge>>
  /**
   * Where the phone's rounds come from: the served corpus, fetched by the
   * host (`apps/www`'s `loadLeetypeRounds`). Absent or rejecting, the bundled
   * `AUTHORED_ROUNDS` plays rather than an empty screen. Phone surface only.
   */
  loadRounds?: () => Promise<ReadonlyArray<unknown>>
  /**
   * The learner shelf (`lib/leetype/shelf`): where a round the learner made
   * is kept on their account when they ask (canon Rem. 7.3). A plain object
   * for the same reason as `loadRounds`; `apps/www` passes one only with a
   * passkey session on a build with a `file_host`. Read only on the phone
   * surface, where rounds are made.
   */
  shelf?: ShelfPort
  /**
   * A round's recorded runs: `apps/www` fetches `GET /leetype/rounds/:id/runs`
   * in `server` mode and resolves `null` in `static` mode. The package checks
   * the result (`lib/leetype/round-runs`). Absent or failing, the bundled
   * transcript (`corpus/runs/`) is shown if it matches the round's bytes.
   * Phone surface only.
   */
  loadRuns?: RoundRunsLoader
  /**
   * What turns a spoken margin note into text (canon Rem. 3.7;
   * `lib/leetype/notes/dictation`). Absent, the browser's own recognizer
   * where it has one; `apps/www`'s Android build passes the phone's, since
   * a WebView has none. `null` offers typing only. Read only on the phone
   * surface.
   */
  dictation?: Dictation | null
}

/**
 * LeetType: a competency probe, on whichever channel the device actually has.
 *
 * ```text
 * Leetype                         picks a modality, then an exercise
 * ├── ExercisePicker               no exercise chosen yet (either surface)
 * ├── ReadingSession  < 768px      the session itself — discriminate the claim (Prop. 9.2)
 * └── TypingSession   ≥ 768px      its optional production probe, standing in for it where there is room
 * ```
 *
 * # Why a branch here rather than responsive CSS
 *
 * Discrimination and production are different interactions, not one at two
 * widths (Prop. 9.2): the small-screen surface is the complete design, and
 * the wide one substitutes a production probe where there is room. Reflowing
 * `TypingSession` into a narrow column would report numbers that mean
 * nothing. A component branch (not a media query) also lets the phone path
 * mount none of the engine: `useTypingGame` cannot be called conditionally,
 * so a phone never fetches `@some-ui/leetype-wasm`. `ExercisePicker` makes
 * its own mobile/desktop choice for the same reason.
 *
 * # The breakpoint is `useIsMobile`'s
 *
 * 768px, from `some-ui-utils`, so the workspace has one answer to "is this a
 * phone". It reads the media query via `useSyncExternalStore`, so the first
 * render already picks the right surface instead of starting a wasm load
 * for what turns out to be a reading session.
 *
 * # The learner chooses the exercise
 *
 * `picked` is this component's whole memory of the choice, cleared once a
 * picker-sourced session finishes so the next one asks again. It also
 * snapshots the remaining time budget at selection (see `mountedAt`). An
 * explicit `exercise` prop always wins and never shows the picker.
 *
 * # The registry contract
 *
 * Mounts with no props and no ambient context (`@some-ui/content-registry`'s
 * rule): a host binds `leetype` and gets whichever surface the device can
 * carry, with the picker first.
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
  loadRounds,
  shelf,
  loadRuns,
  dictation,
}) => {
  const isMobile = useIsMobile()
  const resolved =
    surface === "auto" ? (isMobile ? "reading" : "typing") : surface

  /**
   * The orchestrator removes this component at mount time plus
   * `sessionDurationMs`, fixed before the learner picks anything. Time spent
   * browsing comes out of the session's budget, or a late pick could be
   * unmounted before `onSessionComplete` fires.
   */
  const [mountedAt] = useState(() => performance.now())

  const playsRounds = resolved === "reading" && exercise === undefined
  // The rounds and the session budget left once they arrived, snapshotted
  // together: time spent loading comes out of the term, for the reason
  // `picked` below snapshots it (the orchestrator's deadline is fixed at
  // this component's mount).
  const [roundPlay, setRoundPlay] = useState<{
    rounds: ReadonlyArray<Round>
    remainingMs: number
  } | null>(() =>
    loadRounds === undefined
      ? { rounds: AUTHORED_ROUNDS, remainingMs: sessionDurationMs }
      : null
  )
  useEffect(() => {
    if (!playsRounds || loadRounds === undefined) return
    let live = true
    const settle = (bodies: ReadonlyArray<unknown>): void => {
      if (!live) return
      // Parsed here, not by the host: the host's loader stays free of this
      // package so its chunk stays lazy.
      // A served round that fails the authored-round checks is not
      // playable, so it cannot stand in for the bundled corpus either.
      const rounds = bodies.flatMap((body) => {
        if (lintAuthoredRounds([body]).length > 0) return []
        const parsed = RoundSchema.safeParse(body)
        return parsed.success ? [parsed.data] : []
      })
      setRoundPlay({
        rounds: rounds.length > 0 ? rounds : AUTHORED_ROUNDS,
        remainingMs: Math.max(
          0,
          sessionDurationMs - (performance.now() - mountedAt)
        ),
      })
    }
    loadRounds().then(settle, () => settle(AUTHORED_ROUNDS))
    return (): void => {
      live = false
    }
  }, [playsRounds, loadRounds, sessionDurationMs, mountedAt])

  // Snapshotted once at selection: recomputing per render would keep
  // shrinking the child's `sessionDurationMs` and re-anchor its clock.
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
  // An explicit `exercise` has no picker-time gap: the raw duration is right.
  const activeDurationMs =
    exercise !== undefined ? sessionDurationMs : (picked?.remainingMs ?? 0)

  // Only a picker-sourced choice returns to the picker on completion.
  const handleComplete = useCallback(
    (stats?: CompletedSessionStats): void => {
      onSessionComplete?.(stats)
      if (exercise === undefined) setPicked(undefined)
    },
    [onSessionComplete, exercise]
  )

  // On a phone with no exercise forced, the session is rounds (Def. 1.7). An
  // explicit `exercise` still plays the reading session it names.
  if (playsRounds) {
    return (
      <div className={cn(appearanceClassName(appearance), "absolute inset-0")}>
        {roundPlay === null ? (
          <p
            role="status"
            className="flex h-full items-center justify-center text-sm text-muted-foreground"
          >
            Loading rounds…
          </p>
        ) : (
          <RoundSession
            rounds={roundPlay.rounds}
            sessionDurationMs={roundPlay.remainingMs}
            {...(sessionSeed === undefined ? {} : { sessionSeed })}
            {...(shelf === undefined ? {} : { shelf })}
            {...(loadRuns === undefined ? {} : { loadRuns })}
            {...(dictation === undefined ? {} : { dictation })}
            onSessionComplete={(): void => onSessionComplete?.()}
          />
        )}
      </div>
    )
  }

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
