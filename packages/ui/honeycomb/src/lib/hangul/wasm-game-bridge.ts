import {
  ALL_MAPPINGS,
  getHangulColor,
} from "@honeycomb/utils/hangul-keyboard-mapping"
import type { HangulMapping } from "@honeycomb/utils/hangul-keyboard-mapping"
import type { HangulGameCore } from "hangul-game-core"
import { z } from "zod"

// ============================================================================
// SCHEMAS
// ============================================================================

export const GameConfigSchema = z.object({
  minTimeWindowMs: z.number().positive(),
  maxTimeWindowMs: z.number().positive(),
  correctnessThresholdMs: z.number().positive(),
  speedIncreaseEveryNCorrect: z.number().positive(),
  timeWindowStepMs: z.number().positive(),
  hideRomanizationStreak: z.number().nonnegative(),
  pointsPerCorrect: z.number().int(),
  pointsPerMiss: z.number().int(),
  streakBonusDivisor: z.number().positive(),
  gameDurationMs: z.number().positive(),
  bufferTimeoutMs: z.number().positive(),
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

const GameStatsSchema = z.object({
  score: z.number().int(),
  currentStreak: z.number().int().nonnegative(),
  bestStreak: z.number().int().nonnegative(),
  totalCorrect: z.number().int().nonnegative(),
  totalMissed: z.number().int().nonnegative(),
})

const TimingParamsSchema = z.object({
  spawnIntervalMs: z.number().int().positive(),
  characterLifetimeMs: z.number().int().positive(),
  showRomanization: z.boolean(),
})

const SpawnResultSchema = z.object({
  cellId: z.string(),
  hangul: z.string(),
  expectedKey: z.string(),
  revealedAtMs: z.number().int().nonnegative(),
  playSpawnSound: z.boolean(),
})

// NEW: Simplified event schemas (flattened from EventBatch)
const DifficultyChangeReasonSchema = z.enum([
  "perfectMatch",
  "inputMiss",
  "characterExpired",
])

const GameEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("matchFound"),
    cellId: z.string(),
    hangul: z.string(),
    points: z.number().int(),
    isHighQuality: z.boolean(),
    timeGapMs: z.number().int().nonnegative(),
    countsTowardCompletion: z.boolean(),
  }),
  z.object({
    type: z.literal("charactersExpired"),
    cellIds: z.array(z.string()),
    hanguls: z.array(z.string()),
    count: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("inputMissed"),
  }),
  z.object({
    type: z.literal("bufferUpdated"),
    currentBuffer: z.string(),
  }),
  z.object({
    type: z.literal("ambiguousInput"),
    currentBuffer: z.string(),
    potentialMatches: z.array(z.string()),
  }),
  z.object({
    type: z.literal("characterSpawned"),
    spawnResult: SpawnResultSchema,
  }),
  z.object({
    type: z.literal("boardFull"),
  }),
  z.object({
    type: z.literal("difficultyChanged"),
    newLifetimeMs: z.number().int().nonnegative(),
    newIntervalMs: z.number().int().positive(),
    reason: DifficultyChangeReasonSchema,
  }),
  z.object({
    type: z.literal("streakMilestone"),
    streak: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("statsUpdated"),
    stats: GameStatsSchema,
  }),
])

// ============================================================================
// TYPES
// ============================================================================

export type GameConfig = z.infer<typeof GameConfigSchema>
export type GameProgress = z.infer<typeof GameProgressSchema>
export type GameStatus = z.infer<typeof GameStatusSchema>
export type GameStats = z.infer<typeof GameStatsSchema>
export type TimingParams = z.infer<typeof TimingParamsSchema>
export type SpawnResult = z.infer<typeof SpawnResultSchema>
export type GameEvent = z.infer<typeof GameEventSchema>
export type GameMode = "endless" | "completion"

export type DisplayCharacter = {
  cellId: string
  hangul: string
  qwertyKey: string
  romanization: string
  color: string
  spawnedAt: number
}

type StatusListener = () => void

// ============================================================================
// WASM GAME BRIDGE
// ============================================================================

export class WasmGameBridge {
  private wasmCore: HangulGameCore
  private availableCells: ReadonlyArray<string>
  private gameMode: GameMode
  private statusListeners = new Set<StatusListener>()
  private lastStatus: GameStatus | null = null

  constructor(wasmCore: HangulGameCore, mode: GameMode = "completion") {
    this.wasmCore = wasmCore
    this.availableCells = this.generateCellIds()
    this.gameMode = mode
  }

  // ============================================================================
  // STATUS SUBSCRIPTION (for useSyncExternalStore)
  // ============================================================================

  subscribeToStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  getStatusSnapshot(): GameStatus | null {
    return this.lastStatus
  }

  private notifyStatusChange(): void {
    this.statusListeners.forEach((listener) => listener())
  }

  updateStatus(): void {
    const now = BigInt(Date.now())
    const newStatus = GameStatusSchema.parse(this.wasmCore.getGameStatus(now))

    if (!this.statusEquals(this.lastStatus, newStatus)) {
      this.lastStatus = newStatus
      this.notifyStatusChange()
    }
  }

  private statusEquals(a: GameStatus | null, b: GameStatus): boolean {
    if (!a) return false
    return (
      a.isComplete === b.isComplete &&
      a.isTimedOut === b.isTimedOut &&
      a.timeRemainingMs === b.timeRemainingMs &&
      a.progress.completedKeys === b.progress.completedKeys
    )
  }

  // ============================================================================
  // GAME CONTROL
  // ============================================================================

  startTimer(): void {
    const now = BigInt(Date.now())
    this.wasmCore.startTimer(now)
    this.updateStatus()
  }

  getGameStatus(): GameStatus {
    const now = BigInt(Date.now())
    const result = this.wasmCore.getGameStatus(now)
    return GameStatusSchema.parse(result)
  }

  getMode(): GameMode {
    return this.gameMode
  }

  reset(): void {
    this.wasmCore.reset()
    this.lastStatus = null
    this.notifyStatusChange()
  }

  // ============================================================================
  // EVENT-DRIVEN API
  // ============================================================================

  /**
   * Process a key press - returns array of events
   */
  processKeyPress(key: string): Array<GameEvent> {
    const now = BigInt(Date.now())
    const result = this.wasmCore.processKeyPress(key, now)

    // Parse as array of events
    const events = z.array(GameEventSchema).parse(result)
    return events
  }

  /**
   * Check for expired characters - returns array of events
   */
  checkExpired(): Array<GameEvent> {
    const now = BigInt(Date.now())
    const result = this.wasmCore.checkExpired(now)

    const events = z.array(GameEventSchema).parse(result)
    return events
  }

  /**
   * Spawn a new character - returns array of events
   */
  spawnCharacter(): Array<GameEvent> {
    const now = BigInt(Date.now())
    const result = this.wasmCore.spawnCharacter(now, [...this.availableCells])

    const events = z.array(GameEventSchema).parse(result)
    return events
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Convert spawn event to display character
   */
  createDisplayCharacter(spawn: SpawnResult): DisplayCharacter {
    const mapping = this.getHangulMapping(spawn.hangul)
    return {
      cellId: spawn.cellId,
      hangul: spawn.hangul,
      qwertyKey: spawn.expectedKey,
      romanization: mapping.romanization,
      color: getHangulColor(spawn.hangul),
      spawnedAt: spawn.revealedAtMs,
    }
  }

  private getHangulMapping(hangul: string): HangulMapping {
    const mapping = ALL_MAPPINGS.find((m) => m.hangul === hangul)
    return mapping || { qwerty: "", hangul, romanization: "" }
  }

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

  // ============================================================================
  // LEGACY API (for backward compatibility)
  // ============================================================================

  getStats(): GameStats & { accuracy: number } {
    const stats = GameStatsSchema.parse(this.wasmCore.getStats())
    const total = stats.totalCorrect + stats.totalMissed
    const accuracy = total === 0 ? 0 : (stats.totalCorrect / total) * 100

    return { ...stats, accuracy }
  }

  getTimingParams(): TimingParams {
    const params = this.wasmCore.getTimingParams()
    return TimingParamsSchema.parse(params)
  }

  getCurrentTimeWindow(): number {
    return this.wasmCore.getCurrentTimeWindow()
  }

  getActiveCount(): number {
    return this.wasmCore.getActiveCount()
  }
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_GAME_CONFIG: GameConfig = {
  minTimeWindowMs: 1000,
  maxTimeWindowMs: 3000,
  correctnessThresholdMs: 1500,
  speedIncreaseEveryNCorrect: 2,
  timeWindowStepMs: 150,
  hideRomanizationStreak: 5,
  pointsPerCorrect: 10,
  pointsPerMiss: -5,
  streakBonusDivisor: 5,
  gameDurationMs: 180000,
  bufferTimeoutMs: 400,
}
