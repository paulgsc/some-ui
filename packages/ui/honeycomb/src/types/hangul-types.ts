import type { DisplayCharacter } from "@honeycomb/lib/hangul/wasm-game-bridge"

export type CharacterWithLifetime = DisplayCharacter & {
  timeRemaining: number
  /** True once the character has been completed and is locked into its cell. */
  isSolved?: boolean
  /**
   * The cell belongs to a word that expired unfinished and is being shown
   * back. Outranks the placeholder mask (the debrief reveals unreached jamo)
   * and scores as a miss. Cleared by removing the cell after the debrief.
   */
  isMissed?: boolean
}

/**
 * A vocabulary challenge that expired unfinished: the input to the debrief
 * before the next spawn. A completed word takes the `matchFound` path.
 */
export type MissedWord = {
  cellIds: Array<string>
  answerGlyphs: Array<string>
  /**
   * Tokens matched when the clock ran out: the index of the first jamo never
   * reached. Always less than `answerGlyphs.length`.
   */
  cursor: number
}

/**
 * Masked-word feedback for the tracked multi-token challenge (ADR 0003
 * §2(d)); null when none is in progress, and never set for single-jamo play.

 */
export type WordProgress = {
  cellIds: Array<string>
  answerGlyphs: Array<string>
  cursor: number
}

export type HangulCharacter = {
  id: string
  hangul: string
  qwertyKey: string
  romanization: string
  color: string
  spawnedAt: number
  timeLimit?: number // optional - calculated by WASM
  releaseYear?: number // for compatibility with hex grid
  playedAt?: number // for compatibility with hex grid
}
