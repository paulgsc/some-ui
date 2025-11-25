import {
  getHangulColor,
  getRandomHangul,
} from "@honeycomb/utils/hangul-keyboard-mapping"
import { z } from "zod"

// ============================================================================
// TYPE DEFINITIONS (matching Rust structs)
// ============================================================================

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

const GameStatsSchema = z.object({
  score: z.number().int(),
  currentStreak: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  totalCorrect: z.number().int().nonnegative(),
  totalMissed: z.number().int().nonnegative(),
})

const SpawnResultSchema = z.object({
  cellId: z.string(),
  hangul: z.string(),
  expectedKey: z.string(),
  revealedAtMs: z.number().int().nonnegative(),
})

const MatchResultSchema = z.object({
  matched: z.boolean(),
  cellId: z.string(),
  hangul: z.string(),
  timeGapMs: z.number().int().nonnegative(),
  points: z.number().int(),
  isHighQuality: z.boolean(),
})

const ExpiredResultSchema = z.object({
  cellIds: z.array(z.string()),
  count: z.number().int().nonnegative(),
})

const TimingParamsSchema = z.object({
  spawnIntervalMs: z.number().int().positive(),
  characterLifetimeMs: z.number().int().positive(),
  showRomanization: z.boolean(),
})

export type GameConfig = z.infer<typeof GameConfigSchema>
export type GameStats = z.infer<typeof GameStatsSchema>
export type SpawnResult = z.infer<typeof SpawnResultSchema>
export type MatchResult = z.infer<typeof MatchResultSchema>
export type ExpiredResult = z.infer<typeof ExpiredResultSchema>
export type TimingParams = z.infer<typeof TimingParamsSchema>

// ============================================================================
// WASM INTERFACE (from wasm-bindgen generated .d.ts)
// ============================================================================

type WasmHangulGameCore = {
  spawnCharacter(
    hangul: string,
    expectedKey: string,
    revealedAtMs: bigint,
    availableCellIds: Array<string>
  ): any // Returns SpawnResult or null via serde-wasm-bindgen

  processKeyPress(keysPressed: string, pressedAtMs: bigint): any // Returns MatchResult

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

  constructor(wasmCore: WasmHangulGameCore) {
    this.wasmCore = wasmCore
    this.availableCells = this.generateCellIds()
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
   * Spawn a new character
   * Returns display character if successful, null if grid is full
   */
  spawnCharacter(): DisplayCharacter | null {
    const mapping = getRandomHangul()
    const now = BigInt(Date.now())

    const result = this.wasmCore.spawnCharacter(
      mapping.hangul,
      mapping.qwerty,
      now,
      [...this.availableCells]
    )

    if (result === null || result === undefined) {
      return null
    }

    // WASM returns SpawnResult via serde-wasm-bindgen
    const spawn = SpawnResultSchema.parse(result)

    return {
      cellId: spawn.cellId,
      hangul: spawn.hangul,
      qwertyKey: spawn.expectedKey,
      romanization: mapping.romanization,
      color: getHangulColor(spawn.hangul),
      spawnedAt: spawn.revealedAtMs,
    }
  }

  /**
   * Process a key press
   */
  processKeyPress(keys: string): MatchResult {
    const now = BigInt(Date.now())
    const result = this.wasmCore.processKeyPress(keys, now)
    return MatchResultSchema.parse(result)
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
  correctnessThresholdMs: 1000,
  speedIncreaseEveryNCorrect: 3,
  timeWindowStepMs: 200,
  hideRomanizationStreak: 5,
  pointsPerCorrect: 10,
  pointsPerMiss: -5,
  streakBonusDivisor: 5,
}
