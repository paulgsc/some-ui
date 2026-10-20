import type { FC } from "react"
import { useCallback, useState } from "react"
import type { ExercisePickerBadge } from "@leetype/components/exercise-picker"
import { ExercisePicker } from "@leetype/components/exercise-picker"
import { IncidentSession } from "@leetype/components/incident/incident-session"
import { SessionFilePicker } from "@leetype/components/session-file-picker"
import { TypingSession } from "@leetype/components/typing-game/typing-session"
import {
  nextExercise,
  SESSION_EXERCISE_IDS,
} from "@leetype/lib/leetype/exercises"
import type {
  OpenedSessionFile,
  SessionFileStore,
} from "@leetype/lib/leetype/session-file-pick"
import type { SpokenTakes } from "@leetype/lib/leetype/spoken-take"
import type { Exercise } from "@leetype/types/exercise"
import type {
  CompletedSessionStats,
  TextGradient,
} from "@leetype/types/leetype"
import { cn } from "@some-ui/core-utils"
import { useIsMobile } from "@some-ui/react-hooks"
import type { Appearance } from "@some-ui/styles/theme"
import { appearanceClassName } from "@some-ui/styles/theme"

/**
 * Which probe the player gets. `"auto"` (default, what hosts pass) reads the
 * viewport; the explicit values are for tests, fixtures and deep links.
 * `"rounds"` is the phone's: incident rounds from session files.
 */
export type LeetypeSurface = "auto" | "rounds" | "typing"

/** Matches `TypingSession`'s own default — see why below at `mountedAt`. */
const DEFAULT_SESSION_DURATION_MS = 10 * 60_000

type LeetypeProps = {
  /**
   * A fixed exercise for a preview or deep link, played on the typing
   * surface. Normal sessions omit it and the learner picks from
   * `ExercisePicker`. The seam a generator plugs into (see
   * `lib/leetype/exercises`). The phone's surface ignores it.
   */
  exercise?: Exercise
  /** Session term supplied by the composer/scene, in milliseconds. */
  sessionDurationMs?: number
  /** Cosmetic, and typing-only: the phone paints no gradient. */
  textGradient?: TextGradient
  /**
   * Called once the whole sequence is finished. `stats` comes only from the
   * typing surface; a phone session has no keystrokes to measure, so it
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
   * Where the phone keeps session files picked from storage, and where to
   * look for them (`lib/leetype/session-file-pick`); `samples` when the
   * store holds a viewer's samples instead, which take no picks. Phone
   * surface only; absent, the phone surface says where its sessions come
   * from.
   */
  sessionFiles?: { store: SessionFileStore; hint?: string; samples?: boolean }
  /**
   * The microphone a session file's spoken answers are taken on
   * (`lib/leetype/spoken-take`). Absent, an answer can only be typed.
   */
  takes?: SpokenTakes
}

/**
 * LeetType: a competency probe, on whichever channel the device actually has.
 *
 * ```text
 * Leetype                         picks a surface
 * ├── < 768px                      the phone: incident rounds (Def. 1.9)
 * │   ├── SessionFilePicker        the session files held, each to play
 * │   └── IncidentSession          the file chosen, played to its end
 * └── ≥ 768px                      the typing surface
 *     ├── ExercisePicker           no exercise chosen yet
 *     └── TypingSession            the chosen exercise, typed
 * ```
 *
 * # Why a branch here rather than responsive CSS
 *
 * A phone session and typing are different interactions, not one at two
 * widths.
 * Reflowing `TypingSession` into a narrow column would report numbers that
 * mean nothing. A component branch (not a media query) also lets the phone
 * path mount none of the engine: `useTypingGame` cannot be called
 * conditionally, so a phone never fetches `@some-ui/leetype-wasm`.
 *
 * # The breakpoint is `useIsMobile`'s
 *
 * 768px, from `@some-ui/react-hooks`, so the workspace has one answer to "is this a
 * phone". It reads the media query via `useSyncExternalStore`, so the first
 * render already picks the right surface instead of starting a wasm load
 * for what turns out to be a phone.
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
  textGradient,
  onSessionComplete,
  appearance = "inherit",
  surface = "auto",
  exerciseBadges,
  sessionFiles,
  takes,
}) => {
  const isMobile = useIsMobile()
  const resolved =
    surface === "auto" ? (isMobile ? "rounds" : "typing") : surface

  /**
   * The orchestrator removes this component at mount time plus
   * `sessionDurationMs`, fixed before the learner picks anything. Time spent
   * browsing comes out of the session's budget, or a late pick could be
   * unmounted before `onSessionComplete` fires.
   */
  const [mountedAt] = useState(() => performance.now())

  const playsRounds = resolved === "rounds"

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

  // With what the term leaves at the pick: the session declares no more.
  const [playing, setPlaying] = useState<
    (OpenedSessionFile & { limitMinutes: number }) | null
  >(null)
  const handlePlay = useCallback(
    (opened: OpenedSessionFile): void => {
      const left = sessionDurationMs - (performance.now() - mountedAt)
      setPlaying({ ...opened, limitMinutes: Math.max(0, left) / 60_000 })
    },
    [mountedAt, sessionDurationMs]
  )

  // Only a picker-sourced choice returns to the picker on completion.
  const handleComplete = useCallback(
    (stats?: CompletedSessionStats): void => {
      onSessionComplete?.(stats)
      if (exercise === undefined) setPicked(undefined)
    },
    [onSessionComplete, exercise]
  )

  // A session file the learner chose to play (Def. 1.9), kept through a
  // turn of the phone that widens the window past the breakpoint.
  if (playing !== null) {
    return (
      <div className={cn(appearanceClassName(appearance), "absolute inset-0")}>
        <IncidentSession
          key={playing.name}
          fileName={playing.name}
          file={playing.file}
          limitMinutes={playing.limitMinutes}
          {...(takes === undefined ? {} : { ports: { takes } })}
          onEnd={(): void => {
            setPlaying(null)
            onSessionComplete?.()
          }}
          onBack={(): void => setPlaying(null)}
        />
      </div>
    )
  }

  if (playsRounds) {
    return (
      <div
        className={cn(
          appearanceClassName(appearance),
          "absolute inset-0 flex flex-col"
        )}
      >
        {sessionFiles === undefined ? (
          <p className="flex h-full items-center justify-center text-pretty px-6 text-center text-sm text-muted-foreground">
            On a phone, LeetType plays sessions of incident rounds from files
            added to the phone app from storage.
          </p>
        ) : (
          <SessionFilePicker
            store={sessionFiles.store}
            onPlay={handlePlay}
            {...(sessionFiles.hint === undefined
              ? {}
              : { hint: sessionFiles.hint })}
            samples={sessionFiles.samples ?? false}
            className="min-h-0 flex-1"
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
