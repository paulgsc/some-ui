import type { GameConfig } from "@honeycomb/lib/hangul/wasm-game-bridge"

/**
 * A named difficulty a host offers alongside mode selection. What each means
 * in GameConfig is this package's job; the host passes only the identifier
 * (HangulHexGrid's `difficulty` prop).
 */
export type DifficultyPreset = "relaxed" | "standard" | "challenging"

export const DEFAULT_DIFFICULTY: DifficultyPreset = "standard"

/**
 * Overrides on top of DEFAULT_GAME_CONFIG; "standard" is `{}`, the engine
 * defaults. Only fields a player experiences (timing windows, how fast they
 * shrink, timing forgiveness, romanization hints) vary; scoring and buffer
 * fields stay at the default.
 *
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
