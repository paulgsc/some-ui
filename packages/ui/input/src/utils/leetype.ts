import type { CanonicalUnit } from "@input/types/leetype"

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

// Export for use in CodeDisplay
export { canonicalize, buildIndexMap }
