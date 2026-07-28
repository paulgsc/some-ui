import { buildDisplayMap } from "@leetype/lib/leetype/leetype-wasm-loader"
import type { CanonicalUnit } from "@leetype/types/leetype"

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
 * Derive the cursor's position in `displayCode`'s characters (not canonical
 * units) from the raw, already-accepted keystrokes typed so far - advances
 * exactly one display character per accepted keystroke, including through
 * multi-char whitespace runs where a canonical unit spans several rendered
 * characters.
 */
export function deriveCursorDisplayIndex(rawUserInput: string): number {
  return Array.from(rawUserInput).length
}

/**
 * Derive display map from user input
 * Returns empty array if input is empty
 */
export function deriveDisplayMap(input: string): Array<number> {
  if (!input) return []
  return Array.from(buildDisplayMap(input))
}
