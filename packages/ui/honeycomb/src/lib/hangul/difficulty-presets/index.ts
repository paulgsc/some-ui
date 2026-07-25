import type { GameConfig } from "@honeycomb/lib/hangul/wasm-game-bridge"

/**
 * The lay-facing calibration knob a host app (e.g. the activity setup screen
 * in apps/www) offers alongside mode selection: a named difficulty, not raw
 * GameConfig fields. Resolving "what does 'Challenging' actually mean" is
 * this package's job, not the host app's - the host only ever passes one of
 * these three identifiers through, never a GameConfig shape (see
 * HangulHexGrid's `difficulty` prop).
 */
export type DifficultyPreset = "relaxed" | "standard" | "challenging"

export const DEFAULT_DIFFICULTY: DifficultyPreset = "standard"

/**
 * Overrides applied on top of DEFAULT_GAME_CONFIG. "standard" is `{}` - the
 * engine's own defaults - so picking it is a genuine no-op, not a
 * reassertion of numbers that must be kept in sync by hand.
 *
 * Every field here is one a player actually experiences (how long a
 * character stays up, how quickly that shrinks as they improve, how
 * forgiving "perfect timing" is, how long romanization hints stick around)
 * - scoring/streak-bonus/buffer-timeout fields are left at the engine
 * default for every preset, since they aren't part of what a lay player
 * means by "easier" or "harder".
 */
export const DIFFICULTY_PRESETS: Record<
  DifficultyPreset,
  Partial<GameConfig>
> = {
  relaxed: {
    maxTimeWindowMs: 4000,
    minTimeWindowMs: 1500,
    correctnessThresholdMs: 2000,
    speedIncreaseEveryNCorrect: 3,
    hideRomanizationStreak: 10,
  },
  standard: {},
  challenging: {
    maxTimeWindowMs: 2200,
    minTimeWindowMs: 700,
    correctnessThresholdMs: 900,
    speedIncreaseEveryNCorrect: 1,
    hideRomanizationStreak: 2,
  },
}

export function resolveDifficultyConfig(
  preset: DifficultyPreset | undefined
): Partial<GameConfig> {
  return DIFFICULTY_PRESETS[preset ?? DEFAULT_DIFFICULTY]
}
