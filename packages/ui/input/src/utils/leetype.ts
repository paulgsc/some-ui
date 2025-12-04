import { buildDisplayMap } from "@input/lib/leetype/leetype-wasm-loader"
import type { CanonicalUnit, GameStats } from "@input/types/leetype"

/**
 * Converts code into canonical token stream where:
 * - Non-whitespace characters are preserved as-is
 * - Any sequence of whitespace becomes a single separator token
 */
function canonicalize(input: string): Array<CanonicalUnit> {
  const units: Array<CanonicalUnit> = []
  let inWhitespace = false

  for (const char of input) {
    if (/\s/.test(char)) {
      if (!inWhitespace) {
        units.push({ kind: "sep" })
        inWhitespace = true
      }
      // Skip additional whitespace - already recorded as separator
    } else {
      units.push({ kind: "char", value: char })
      inWhitespace = false
    }
  }

  return units
}

/**
 * Builds a mapping from raw string index to canonical unit index
 * Used for cursor positioning and highlighting
 */
function buildIndexMap(
  input: string,
  units: Array<CanonicalUnit>
): Array<number> {
  const map: Array<number> = []
  let unitIndex = 0
  let inWhitespace = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (/\s/.test(char)) {
      if (!inWhitespace) {
        map.push(unitIndex)
        unitIndex++
        inWhitespace = true
      } else {
        // Additional whitespace - maps to same separator unit
        map.push(unitIndex - 1)
      }
    } else {
      map.push(unitIndex)
      unitIndex++
      inWhitespace = false
    }
  }

  return map
}

/**
 * Given a raw string position, returns the canonical unit index
 */
export function getCanonicalIndexAtPosition(
  rawString: string,
  position: number
): number {
  const map = buildIndexMap(rawString, canonicalize(rawString))
  return map[Math.min(position, map.length - 1)] ?? 0
}

/**
 * Given a canonical unit index, returns the first raw string position
 */
export function getRawPositionForCanonicalIndex(
  rawString: string,
  canonicalIndex: number
): number {
  const map = buildIndexMap(rawString, canonicalize(rawString))
  return map.findIndex((idx) => idx === canonicalIndex)
}

/**
 * Finds the start index of the token containing the given position
 * A token is a sequence of non-separator units
 */
export function findTokenStart(
  units: Array<CanonicalUnit>,
  position: number
): number {
  for (let i = position - 1; i >= 0; i--) {
    if (units[i].kind === "sep") {
      return i + 1
    }
  }
  return 0
}

/**
 * Finds the end index of the token starting at the given position
 * Returns the index of the next separator or end of array
 */
export function findTokenEnd(
  units: Array<CanonicalUnit>,
  startIndex: number
): number {
  for (let i = startIndex; i < units.length; i++) {
    if (units[i].kind === "sep") {
      return i
    }
  }
  return units.length
}

/**
 * Compares two token sequences and returns detailed mismatch information
 * Returns null if tokens match, or an object with error details
 */
export function compareTokens(
  userUnits: Array<CanonicalUnit>,
  targetUnits: Array<CanonicalUnit>,
  tokenStart: number,
  tokenEnd: number
): {
  hasError: boolean
  firstErrorIndex: number | null
  errorCount: number
} {
  let hasError = false
  let firstErrorIndex: number | null = null
  let errorCount = 0

  for (let i = tokenStart; i < tokenEnd; i++) {
    const expected = targetUnits[i]
    const actual = userUnits[i]

    // Check if we've exceeded target length
    if (!expected) {
      if (!hasError) {
        hasError = true
        firstErrorIndex = i
      }
      errorCount++
      continue
    }

    // Check for unit mismatch
    if (expected.kind !== actual.kind) {
      if (!hasError) {
        hasError = true
        firstErrorIndex = i
      }
      errorCount++
      continue
    }

    // Check character mismatch
    if (
      expected.kind === "char" &&
      actual.kind === "char" &&
      expected.value !== actual.value
    ) {
      if (!hasError) {
        hasError = true
        firstErrorIndex = i
      }
      errorCount++
    }
  }

  return { hasError, firstErrorIndex, errorCount }
}

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
  return stats.cursor ?? 0
}

/**
 * Derive display map from user input
 * Returns empty array if input is empty
 */
export function deriveDisplayMap(input: string): Array<number> {
  if (!input) return []
  return Array.from(buildDisplayMap(input))
}

// Export for use in CodeDisplay and typing game
export { canonicalize, buildIndexMap }
