import {
  ALL_MAPPINGS,
  getHangulColor,
} from "@honeycomb/utils/hangul-keyboard-mapping"
import { z } from "zod"

const GameConfigSchema = z.object({
  minTimeWindowMs: z.number().positive(),
  maxTimeWindowMs: z.number().positive(),
  correctnessThresholdMs: z.number().positive(),
  speedIncreaseEveryNCorrect: z.number().positive(),
  timeWindowStepMs: z.number().positive(),
  hideRomanizationStreak: z.number().nonnegative(),
  pointsPerCorrect: z.number().int(),
  pointsPerMiss: z.number().int(),
  streakBonusDivisor: z.number().positive(),
})

const GameProgressSchema = z.object({
  totalKeys: z.number().int().nonnegative(),
  completedKeys: z.number().int().nonnegative(),
  remainingKeys: z.number().int().nonnegative(),
  completionPercentage: z.number(),
  keysCompletedList: z.array(z.string()),
})

const GameStatusSchema = z.object({
  isComplete: z.boolean(),
  isTimedOut: z.boolean(),
  timeRemainingMs: z.number().int().nonnegative(),
  progress: GameProgressSchema,
})

export type GameProgress = z.infer<typeof GameProgressSchema>
export type GameStatus = z.infer<typeof GameStatusSchema>
export type GameMode = "endless" | "completion"

const GameStatsSchema = z.object({
  score: z.number().int(),
  currentStreak: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  totalCorrect: z.number().int().nonnegative(),
  totalMissed: z.number().int().nonnegative(),
})

// NEW: Audio events schema
const AudioEventsSchema = z.object({
  matchCorrect: z.boolean(),
  matchPerfect: z.boolean(),
  matchMiss: z.boolean(),
  characterExpired: z.boolean(),
  streakMilestone: z.boolean(),
  difficultyChanged: z.boolean(),
})

const SpawnResultSchema = z.object({
  cellId: z.string(),
  hangul: z.string(),
  expectedKey: z.string(),
  revealedAtMs: z.number().int().nonnegative(),
  playSpawnSound: z.boolean(),
})

// UPDATED: KeyPressResult with audio events
const KeyPressResultSchema = z.object({
  matched: z.boolean(),
  isPartialMatch: z.boolean(),
  shouldClearBuffer: z.boolean(),
  hangul: z.string(),
  cellId: z.string(),
  points: z.number().int(),
  timeGapMs: z.number().int().nonnegative(),
  isHighQuality: z.boolean(),
  currentBuffer: z.string(),
  audioEvents: AudioEventsSchema,
  countsTowardCompletion: z.boolean(),
})

const ExpiredResultSchema = z.object({
  cellIds: z.array(z.string()),
  count: z.number().int().nonnegative(),
  playExpireSound: z.boolean(),
})

const TimingParamsSchema = z.object({
  spawnIntervalMs: z.number().int().positive(),
  characterLifetimeMs: z.number().int().positive(),
  showRomanization: z.boolean(),
})

export type GameConfig = z.infer<typeof GameConfigSchema>
export type GameStats = z.infer<typeof GameStatsSchema>
export type AudioEvents = z.infer<typeof AudioEventsSchema>
export type SpawnResult = z.infer<typeof SpawnResultSchema>
export type KeyPressResult = z.infer<typeof KeyPressResultSchema>
export type ExpiredResult = z.infer<typeof ExpiredResultSchema>
export type TimingParams = z.infer<typeof TimingParamsSchema>

// ============================================================================
// WASM INTERFACE (from wasm-bindgen generated .d.ts)
// ============================================================================

export type WasmHangulGameCore = {
  // Updated constructor signature
  new (
    config: GameConfig,
    mode: string,
    gameDurationSeconds?: number
  ): WasmHangulGameCore

  startTimer(currentTimeMs: bigint): void

  getGameStatus(currentTimeMs: bigint): any // Returns GameStatus

  spawnCharacter(revealedAtMs: bigint, availableCellIds: Array<string>): any

  processKeyPress(key: string, pressedAtMs: bigint): any // Returns KeyPressResult

  checkExpired(currentTimeMs: bigint): any // Returns ExpiredResult

  getStats(): any // Returns GameStats

  getTimingParams(): any // Returns TimingParams

  getCurrentTimeWindow(): number

  getActiveCount(): number

  reset(): void
}

// ============================================================================
// DISPLAY CHARACTER TYPE (for UI layer)
// ============================================================================

export type DisplayCharacter = {
  cellId: string
  hangul: string
  qwertyKey: string
  romanization: string
  color: string
  spawnedAt: number
}

// ============================================================================
// BRIDGE CLASS
// ============================================================================

export class WasmGameBridge {
  private wasmCore: WasmHangulGameCore
  private availableCells: ReadonlyArray<string>
  private gameMode: GameMode

  constructor(wasmCore: WasmHangulGameCore, mode: GameMode = "completion") {
    this.wasmCore = wasmCore
    this.availableCells = this.generateCellIds()
    this.gameMode = mode
  }

  /**
   * Start the game timer (for timed modes)
   */
  startTimer(): void {
    const now = BigInt(Date.now())
    this.wasmCore.startTimer(now)
  }

  /**
   * Get current game status (completion, timeout, progress)
   */
  getGameStatus(): GameStatus {
    const now = BigInt(Date.now())
    const result = this.wasmCore.getGameStatus(now)
    return GameStatusSchema.parse(result)
  }

  /**
   * Spawn a new character (game mode determines which character)
   */
  spawnCharacter(): (DisplayCharacter & { playSpawnSound: boolean }) | null {
    const now = BigInt(Date.now())

    const result = this.wasmCore.spawnCharacter(now, [...this.availableCells])

    if (result === null || result === undefined) {
      return null
    }

    const spawn = SpawnResultSchema.parse(result)

    // Get mapping info for display
    const mapping = this.getHangulMapping(spawn.hangul)

    return {
      cellId: spawn.cellId,
      hangul: spawn.hangul,
      qwertyKey: spawn.expectedKey,
      romanization: mapping.romanization,
      color: getHangulColor(spawn.hangul),
      spawnedAt: spawn.revealedAtMs,
      playSpawnSound: spawn.playSpawnSound,
    }
  }

  /**
   * Get the game mode
   */
  getMode(): GameMode {
    return this.gameMode
  }

  private getHangulMapping(hangul: string) {
    // Get mapping from your utils
    const mapping = ALL_MAPPINGS.find((m) => m.hangul === hangul)
    return mapping || { qwerty: "", hangul, romanization: "" }
  }

  /**
   * Generate hex cell IDs: "hex_q_r_s"
   */
  private generateCellIds(): ReadonlyArray<string> {
    const cells: Array<string> = ["hex_0_0_0"]
    const rings = 3

    for (let ring = 1; ring <= rings; ring++) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < ring; j++) {
          const angle = (i * 60 - 30) * (Math.PI / 180)
          const q = Math.round(
            ring * Math.cos(angle) - j * Math.cos(angle + Math.PI / 3)
          )
          const r = Math.round(
            ring * Math.sin(angle) - j * Math.sin(angle + Math.PI / 3)
          )
          const s = -q - r
          cells.push(`hex_${q}_${r}_${s}`)
        }
      }
    }

    return cells
  }

  /**
   * Process a key press (single character)
   */
  processKeyPress(key: string): KeyPressResult {
    const now = BigInt(Date.now())
    const result = this.wasmCore.processKeyPress(key, now)
    return KeyPressResultSchema.parse(result)
  }

  /**
   * Check for expired characters
   */
  checkExpired(): ExpiredResult {
    const now = BigInt(Date.now())
    const result = this.wasmCore.checkExpired(now)
    return ExpiredResultSchema.parse(result)
  }

  /**
   * Get current game stats
   */
  getStats(): GameStats & { accuracy: number } {
    const stats = GameStatsSchema.parse(this.wasmCore.getStats())
    const total = stats.totalCorrect + stats.totalMissed
    const accuracy = total === 0 ? 0 : (stats.totalCorrect / total) * 100

    return { ...stats, accuracy }
  }

  /**
   * Get timing parameters
   */
  getTimingParams(): TimingParams {
    const params = this.wasmCore.getTimingParams()
    return TimingParamsSchema.parse(params)
  }

  /**
   * Get current time window
   */
  getCurrentTimeWindow(): number {
    return this.wasmCore.getCurrentTimeWindow()
  }

  /**
   * Get number of active characters
   */
  getActiveCount(): number {
    return this.wasmCore.getActiveCount()
  }

  /**
   * Reset game
   */
  reset(): void {
    this.wasmCore.reset()
  }
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_GAME_CONFIG: GameConfig = {
  minTimeWindowMs: 1500,
  maxTimeWindowMs: 4000,
  correctnessThresholdMs: 2000,
  speedIncreaseEveryNCorrect: 1,
  timeWindowStepMs: 200,
  hideRomanizationStreak: 5,
  pointsPerCorrect: 10,
  pointsPerMiss: -5,
  streakBonusDivisor: 5,
}
