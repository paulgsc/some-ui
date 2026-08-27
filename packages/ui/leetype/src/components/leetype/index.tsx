import type { FC } from "react"
import { ReadingSession } from "@leetype/components/reading-game/reading-session"
import { TypingSession } from "@leetype/components/typing-game/typing-session"
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

type LeetypeProps = {
  /**
   * A fixed exercise for a preview or deep link. Normal sessions omit this
   * prop and traverse the eligible corpus through the seeded schedule.
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
}

/**
 * LeetType: a competency probe, on whichever channel the device actually has.
 *
 * ```text
 * Leetype                         picks a modality, and nothing else
 * ├── TypingSession   ≥ 768px     produce the witness  (the M20 surface)
 * └── ReadingSession  < 768px     discriminate the claim (LTY-MOBILE)
 * ```
 *
 * # Why a branch here rather than responsive CSS one level down
 *
 * Because the two surfaces are not the same interaction at two widths. The
 * typing surface's reveal loop, gate, baseline sampling and WPM figures are
 * all facts about a player producing code under time pressure; on a phone
 * there is no keyboard to produce it with, and every one of those figures
 * measures a channel that is switched off. Reflowing that surface into a
 * narrow column yields a screen that *looks* playable and reports numbers
 * that mean nothing — which is worse than not offering it.
 *
 * So the breakpoint is not `desktop diff → smaller desktop diff`. It is
 * `production probe → discrimination probe`, and expressing it as a component
 * branch rather than a media query is what lets the mobile path mount none of
 * the engine: `TypingSession` is where `useTypingGame` lives, and a hook
 * cannot be called conditionally. A phone therefore never fetches
 * `@some-ui/leetype-wasm` at all.
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
 * # The registry contract
 *
 * Mounts with no props and no ambient context, exactly as before
 * (`@some-ui/content-registry`'s own rule). A host binds `leetype` and gets
 * whichever surface the device can actually carry, without knowing there are
 * two.
 */
export const Leetype: FC<LeetypeProps> = ({
  exercise,
  sessionDurationMs,
  sessionSeed,
  textGradient,
  onSessionComplete,
  appearance = "inherit",
  surface = "auto",
}) => {
  const isMobile = useIsMobile()
  const resolved =
    surface === "auto" ? (isMobile ? "reading" : "typing") : surface

  if (resolved === "reading") {
    return (
      <div className={cn(appearanceClassName(appearance), "absolute inset-0")}>
        <ReadingSession
          exercise={exercise}
          sessionDurationMs={sessionDurationMs}
          sessionSeed={sessionSeed}
          onSessionComplete={
            onSessionComplete && ((): void => onSessionComplete())
          }
        />
      </div>
    )
  }

  return (
    <TypingSession
      exercise={exercise}
      sessionDurationMs={sessionDurationMs}
      sessionSeed={sessionSeed}
      textGradient={textGradient}
      onSessionComplete={onSessionComplete}
      appearance={appearance}
    />
  )
}
