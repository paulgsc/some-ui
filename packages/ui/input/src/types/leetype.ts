import { z } from "zod"

export type GameState = "idle" | "playing" | "finished" | "timeout"

export type DisplayMode = "shown" | "hidden"
export type Language = "typescript" | "rust" | "cpp" | "c"
export type SessionMode = "data-structure" | "algorithm"
export type Difficulty = "easy" | "medium" | "hard"
export type NContext = "tiny" | "small" | "medium" | "large"

export const N_VALUES: Record<NContext, number> = {
  tiny: 10,
  small: 100,
  medium: 1000,
  large: 10000,
}

export type Challenge = {
  id: string
  title: string
  description: string
  difficulty: Difficulty
  mode: SessionMode
  tags: Array<string>
  codePaths: Record<Language, string>
  levelRequired: number
}

export type CompletedSessionStats = {
  wpm: number
  accuracy: number
  elapsedTime: number
  errors: number
  displayMode: DisplayMode
  wasAdaptive: boolean
  gameState: "finished" | "timeout"
}

export type SolveRecord = {
  challengeId: string
  solvedAt: number
  wpm: number
  accuracy: number
  elapsedTime: number
  errors: number
  n: NContext | null
  displayMode: DisplayMode
  xpEarned: number
}

export type PlayerProgress = {
  xp: number
  level: number
  solves: Array<SolveRecord>
}

export type CodeSample = {
  title: string
  description: string
  code: string
}

export type CodeSamplesMap = {
  [L in Language]: CodeSample
}

// Zod schemas matching the Rust types
export const CanonicalUnitSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("char"),
    value: z.string(),
  }),
  z.object({
    kind: z.literal("separator"),
    value: z.string(),
  }),
])

export const InputResultSchema = z.object({
  total_errors: z.number(),
  consecutive_errors: z.number(),
  show_error_alert: z.boolean(),
  accepted: z.boolean(),
})

export const GameStatsSchema = z.object({
  progress: z.number(),
  accuracy: z.number(),
  wpm: z.number(),
  elapsed_time: z.number(),
  total_errors: z.number(),
  consecutive_errors: z.number(),
  show_error_alert: z.boolean(),
  cursor: z.number(),
  is_complete: z.boolean(),
})

export const ChunkCompletionStatsSchema = z.object({
  chars_typed: z.number(),
  errors: z.number(),
  elapsed_time: z.number(),
})

// TypeScript types derived from schemas
export type CanonicalUnit = z.infer<typeof CanonicalUnitSchema>
export type InputResult = z.infer<typeof InputResultSchema>
export type GameStats = z.infer<typeof GameStatsSchema>
export type ChunkCompletionStats = z.infer<typeof ChunkCompletionStatsSchema>

// WASM module interface
export type TypingGameWasm = {
  new (target_code: string, max_consecutive_errors?: number): TypingGameWasm
  start(timestamp: number): void
  reset(): void
  handle_input(input: string): unknown
  get_stats(current_timestamp: number): unknown
  get_user_input(): string
  get_target_units(): unknown
  get_user_units(): unknown
  get_cursor(): number
  free(): void
  complete_chunk(current_timestamp: number): unknown
  start_next_chunk(new_target_code: string): void
  reset_game(): void
  get_cumulative_stats(): unknown
  target_length(): number
}

export type WasmModule = {
  TypingGame: new (
    target_code: string,
    max_consecutive_errors?: number
  ) => TypingGameWasm
  canonicalize_text(input: string): unknown
  build_display_map_from_code(input: string): Array<number>
}

export type TypedTypingGame = {
  start(timestamp: number): void
  reset(): void
  handleInput(input: string): InputResult
  getStats(currentTimestamp: number): GameStats
  getUserInput(): string
  getTargetUnits(): Array<CanonicalUnit>
  getUserUnits(): Array<CanonicalUnit>
  getCursor(): Array<CanonicalUnit>
  dismissError(): void
  free(): void
  getTargetLength(): number
  subscribeStats(callback: () => void): () => void
  completeChunk(currentTimestamp: number): ChunkCompletionStats
  startNextChunk(newTargetCode: string): void
  resetGame(): void
  getCumulativeStats(): [number, number]
}

// If you need to update the ref type used in createTypingGameStore:
export type GameRef = { current: TypedTypingGame | null }
