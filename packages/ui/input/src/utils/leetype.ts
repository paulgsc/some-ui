import { buildDisplayMap } from "@input/lib/leetype/leetype-wasm-loader"
import type { CanonicalUnit, GameStats } from "@input/types/leetype"

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
