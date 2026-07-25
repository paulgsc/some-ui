import type { DisplayCharacter } from "@honeycomb/lib/hangul/wasm-game-bridge"

export type CharacterWithLifetime = DisplayCharacter & {
  timeRemaining: number
  /** True once the character has been completed and is locked into its cell. */
  isSolved?: boolean
}

/**
 * Masked-word feedback state for the currently-tracked multi-token challenge
 * (ADR 0003 §2(d)'s feedback overlay, #426) - null when no word challenge is
 * in progress. Single-jamo (n=1) challenges never populate this; they only
 * ever have one token, so there is no "so far vs. remaining" to show.
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

export type ActiveHangulCell = {
  character: HangulCharacter
  cellId: string
  isExpiring: boolean
  opacity: number
}

export type GameStats = {
  totalAttempts: number
  correctAttempts: number
  missedCharacters: number
  currentStreak: number
  bestStreak: number
  score: number
}

export type GameSettings = {
  characterDisplayTime: number // milliseconds
  spawnInterval: number // milliseconds
  maxActiveCells: number
  pointsPerCorrect: number
  pointsPerMiss: number
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  characterDisplayTime: 3000, // 3 seconds to type
  spawnInterval: 1500, // new character every 1.5 seconds
  maxActiveCells: 37,
  pointsPerCorrect: 10,
  pointsPerMiss: -5,
}
