import {
  ALL_MAPPINGS,
  getHangulColor,
} from "@honeycomb/utils/hangul-keyboard-mapping"
import type { HangulMapping } from "@honeycomb/utils/hangul-keyboard-mapping"
import { getCellCountForHexagonalGridRadius } from "@honeycomb/utils/hexagon-math"
import type { HangulGameCore } from "@some-ui/hangul-game-core"
import { z } from "zod"

/**
 * Radius of the hex board the game plays on.
 *
 * The engine reserves a cell permanently for every completed character
 * (persist-on-completion), so the pool of spawnable cells must be at least as
 * large as the largest set of characters a mode can require the player to
 * master, plus headroom for characters that are still in flight. Completion
 * mode currently tests 40 distinct jamo; a radius-4 board is
 * `3r² + 3r + 1 = 61` cells, which clears that with room to spare.
 *
 * This radius is the single source of truth for board size: `generateCellIds`
 * enumerates the pool from it, and the rendered `HexGrid` is sized from
 * `HANGUL_GRID_CELL_COUNT` so the engine's cell ids and the rendered cell ids
 * are the same set.
 */
export const HANGUL_GRID_RADIUS = 4
export const HANGUL_GRID_CELL_COUNT =
  getCellCountForHexagonalGridRadius(HANGUL_GRID_RADIUS)

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

// Stimulus (canon Def. 3.1, ADR 0001 §2(a)): what the player perceives. The engine only ever
// carries ids/refs (Axiom 3.1's asset-opacity invariant) - this package resolves them to
// renderable/speakable sources (icon glyphs via @honeycomb/data, TTS via
// @honeycomb/lib/hangul/speech).
const StimulusSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("glyph"), text: z.string() }),
  z.object({ kind: z.literal("image"), assetId: z.string() }),
  z.object({ kind: z.literal("icon"), name: z.string() }),
  z.object({
    kind: z.literal("speech"),
    audioRef: z.string().optional(),
    ttsText: z.string().optional(),
  }),
])

// cellId/hangul/expectedKey are the pre-#421 fields (first cell / full display text / first
// token's key), kept exactly as-is for single-jamo back-compat; cellIds/stimulus/answerKeys/
// answerGlyphs are the ADR 0001/0003 widening (canon Rem. 8.1: additive only).
const SpawnResultSchema = z.object({
  cellId: z.string(),
  cellIds: z.array(z.string()),
  hangul: z.string(),
  expectedKey: z.string(),
  stimulus: StimulusSchema,
  answerKeys: z.array(z.string()),
  answerGlyphs: z.array(z.string()),
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
    cellIds: z.array(z.string()),
    hangul: z.string(),
    answerGlyphs: z.array(z.string()),
    stimulus: StimulusSchema,
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
    type: z.literal("answerProgress"),
    cellIds: z.array(z.string()),
    composedSoFar: z.array(z.string()),
    remaining: z.array(z.string()),
    cursor: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
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
export type Stimulus = z.infer<typeof StimulusSchema>
export type SpawnResult = z.infer<typeof SpawnResultSchema>
export type GameEvent = z.infer<typeof GameEventSchema>
export type GameMode =
  | "endless"
  | "completion"
  | "vocabulary"
  | "vocabulary-endless"

export type DisplayCharacter = {
  cellId: string
  cellIds: Array<string>
  hangul: string
  qwertyKey: string
  romanization: string
  color: string
  spawnedAt: number
  stimulus: Stimulus
  answerKeys: Array<string>
  answerGlyphs: Array<string>
  /** This cell's position in a multi-cell challenge; 0 for single-cell (jamo) challenges. */
  tokenIndex: number
  /** Tokens matched so far in the shared challenge; this cell is revealed once cursor > tokenIndex. */
  cursor: number
}

export type ChallengeSeed = {
  stimulus: Stimulus
  answerKeys: Array<string>
  answerGlyphs: Array<string>
  identity: string
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

  /**
   * Switches to a different game mode (and word pool, for vocabulary modes)
   * on the existing engine instance, instead of constructing a new
   * HangulGameCore - mode is runtime lifecycle state a session can
   * legitimately change, not fixed construction-time configuration (ADR
   * 0004 §2(f)). Clears board/stats exactly like reset() does.
   */
  changeMode(mode: GameMode, wordPool: Array<ChallengeSeed> = []): void {
    this.wasmCore.changeMode(mode, wordPool)
    this.gameMode = mode
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

  /**
   * Correct the in-progress token before it locks in (ADR 0003 §2(b)) -
   * returns array of events
   */
  processBackspace(): Array<GameEvent> {
    const now = BigInt(Date.now())
    const result = this.wasmCore.processBackspace(now)

    const events = z.array(GameEventSchema).parse(result)
    return events
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Convert a spawn event into one display character per reserved cell
   * (ADR 0003 §2(a), multi-cell binding). A single-jamo (n=1) spawn returns
   * a one-element array with exactly today's shape; a word spawn returns
   * `answerKeys.length` entries, each carrying only its own token - sibling
   * cells share one color and one `stimulus`, so the word reads as one
   * challenge rather than several unrelated ones.
   */
  createDisplayCharacters(spawn: SpawnResult): Array<DisplayCharacter> {
    const color = getHangulColor(spawn.answerGlyphs[0] ?? spawn.hangul)

    return spawn.cellIds.map((cellId, tokenIndex) => {
      const glyph = spawn.answerGlyphs[tokenIndex] ?? ""
      const key = spawn.answerKeys[tokenIndex] ?? ""
      const mapping = this.getHangulMapping(glyph)

      return {
        cellId,
        cellIds: spawn.cellIds,
        hangul: glyph,
        qwertyKey: key,
        romanization: mapping.romanization,
        color,
        spawnedAt: spawn.revealedAtMs,
        stimulus: spawn.stimulus,
        answerKeys: spawn.answerKeys,
        answerGlyphs: spawn.answerGlyphs,
        tokenIndex,
        cursor: 0,
      }
    })
  }

  private getHangulMapping(hangul: string): HangulMapping {
    const mapping = ALL_MAPPINGS.find((m) => m.hangul === hangul)
    return mapping ?? { qwerty: "", hangul, romanization: "" }
  }

  /**
   * Enumerate every cell of the radius-`HANGUL_GRID_RADIUS` hex board as exact
   * cube coordinates (`x + y + z = 0`), formatted to match the ids emitted by
   * the `some-hexagon` renderer (`hex_{x}_{y}_{z}`).
   *
   * The previous implementation approximated ring coordinates with rounded
   * trigonometry, which (a) collided so it produced only ~33 distinct cells
   * from a nominal 37, (b) emitted at least one off-grid id that no rendered
   * cell matched (so a character spawned there was invisible), and (c) was a
   * smaller, divergent set from the rendered grid. Enumerating the cube
   * coordinates directly makes the spawn pool exact, fully renderable, and
   * large enough that persist-on-completion cannot deadlock completion mode.
   */
  private generateCellIds(): ReadonlyArray<string> {
    const radius = HANGUL_GRID_RADIUS
    const cells: Array<string> = []

    for (let x = -radius; x <= radius; x++) {
      const yMin = Math.max(-radius, -x - radius)
      const yMax = Math.min(radius, -x + radius)
      for (let y = yMin; y <= yMax; y++) {
        const z = -x - y
        cells.push(`hex_${x}_${y}_${z}`)
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

// Every field here must match `GameConfig::default()` in
// crates/hangul-game-core/src/internal/types.rs field for field. There is
// no automated single-sourcing across the Rust/TS boundary, so
// `default-config-parity.test.ts` (mirroring
// `default_matches_typescript_bridge_defaults` in that Rust file) is the
// only thing that catches the two copies drifting apart (Prop. 2.3).
//
// correctnessThresholdMs is deliberately 1500, not the Rust default's
// former (unreachable) 600: because `loadHangulWasm` always merges this
// object before constructing `HangulGameCore`, 1500 is the value every
// real game session has actually run at, so it's the value the Rust side
// was reconciled to rather than the reverse.
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
