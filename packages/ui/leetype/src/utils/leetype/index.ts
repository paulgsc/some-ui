import { buildDisplayMap } from "@leetype/lib/leetype/leetype-wasm-loader"
import type {
  CanonicalUnit,
  Challenge,
  Difficulty,
  GameStats,
} from "@leetype/types/leetype"

export function codeToUnits(code: string): Array<CanonicalUnit> {
  return Array.from(code).map((char) => ({
    kind: "char",
    value: char,
  }))
}

export function sliceUserUnits(
  target: Array<CanonicalUnit>,
  typedChars: number
): Array<CanonicalUnit> {
  return target.slice(0, typedChars)
}

/**
 * Derive cursor index from game stats
 */
export function deriveCursorIndex(stats: GameStats): number {
  return stats.cursor
}

/**
 * Derive display map from user input
 * Returns empty array if input is empty
 */
export function deriveDisplayMap(input: string): Array<number> {
  if (!input) return []
  return Array.from(buildDisplayMap(input))
}

/**
 * Resolves a friendly `difficulty` identifier into one challenge from
 * `challenges` - deterministic (first match, not random), so replaying a
 * session shows the same challenge it did the first time. Falls back to the
 * pool's first entry when nothing matches, mirroring the pool always having
 * *something* playable rather than leaving the caller with `undefined` for
 * an off-pool difficulty label. Returns `undefined` only when `difficulty`
 * itself is absent, so a caller that already has a fully hydrated
 * `challenge` never needs to call this at all.
 */
export function resolveChallenge(
  challenges: ReadonlyArray<Challenge>,
  difficulty: Difficulty | undefined
): Challenge | undefined {
  if (!difficulty) return undefined
  return challenges.find((c) => c.difficulty === difficulty) ?? challenges[0]
}
