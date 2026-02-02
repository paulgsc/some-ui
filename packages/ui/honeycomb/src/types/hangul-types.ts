import type { DisplayCharacter } from "@honeycomb/lib/hangul/wasm-game-bridge"

export type CharacterWithLifetime = DisplayCharacter & {
  timeRemaining: number
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
