import type {
  CanonicalUnit,
  ChunkCompletionStats,
  GameStats,
  InputResult,
  TypingGameWasm,
  WasmModule,
} from "@leetype/types/leetype"
import {
  CanonicalUnitSchema,
  ChunkCompletionStatsSchema,
  GameStatsSchema,
  InputResultSchema,
} from "@leetype/types/leetype"
import { createWasmLoader } from "@some-ui/wasm-loader"
import { z } from "zod"

const loader = createWasmLoader<WasmModule>({
  importModule: async () => {
    try {
      const wasm = await import("@some-ui/leetype-wasm")
      await wasm.default() // Initialize the WASM module
      // The wasm-bindgen output's generated shape doesn't structurally match
      // the hand-written WasmModule type, so a cast is unavoidable here -
      // the single, documented cast for this file.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
      return wasm as unknown as WasmModule
    } catch (error) {
      throw new Error(
        `Failed to load WASM module: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
  },
  // Preserves this loader's original throw-on-error contract (unlike
  // polyhedron/hangul's log-and-resolve-null posture).
  errorPolicy: "throw",
})

/**
 * Load the WASM module (singleton pattern)
 */
export async function loadWasm(): Promise<WasmModule> {
  const mod = await loader.load()
  if (mod === null) {
    // Unreachable under the "throw" error policy above (a failed load
    // rejects instead of resolving null) - satisfies the return type.
    throw new Error("Failed to load WASM module: unknown error")
  }
  return mod
}

/**
 * Type-safe wrapper around the WASM TypingGame with React subscription support
 */
export class TypedTypingGame {
  private instance: TypingGameWasm
  private listeners = new Set<() => void>()
  private cachedStats: GameStats | null = null

  constructor(targetCode: string, maxConsecutiveErrors?: number) {
    const wasmModule = loader.peek()
    if (!wasmModule) {
      throw new Error("WASM module not loaded. Call loadWasm() first.")
    }
    this.instance = new wasmModule.TypingGame(targetCode, maxConsecutiveErrors)
  }

  /**
   * Complete current chunk and extract stats.
   * Returns stats for the completed chunk.
   */
  completeChunk(currentTimestamp: number): ChunkCompletionStats {
    const result = this.instance.complete_chunk(currentTimestamp)
    this.notifyListeners()
    return ChunkCompletionStatsSchema.parse(result)
  }

  /**
   * Start next chunk with new target code.
   * Previous chunk data is discarded (bounded memory).
   */
  startNextChunk(newTargetCode: string): void {
    this.instance.start_next_chunk(newTargetCode)
    this.notifyListeners()
  }

  /**
   * Reset entire game (all chunks, all cumulative stats).
   */
  resetGame(): void {
    this.instance.reset_game()
    this.notifyListeners()
  }

  /**
   * Get cumulative stats across alal completed chunks.
   * Returns [totalCharsTyped, totalErrors]
   */
  getCumulativeStats(): [number, number] {
    const result = this.instance.get_cumulative_stats()
    return z.tuple([z.number(), z.number()]).parse(result)
  }

  /**
   * Get the current target length in canonical units.
   * Useful for UI to track progress with chunked loading.
   */
  getTargetLength(): number {
    return this.instance.target_length()
  }

  /**
   * Subscribe to stats changes (for React external store)
   * Returns an unsubscribe function
   */
  subscribeStats(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  /**
   * Notify all subscribers that stats have changed
   * Also invalidates the cached stats
   */
  private notifyListeners(): void {
    this.cachedStats = null // Invalidate cache
    this.listeners.forEach((cb) => cb())
  }

  start(timestamp: number): void {
    this.instance.start(timestamp)
    this.notifyListeners()
  }

  reset(): void {
    this.instance.reset()
    this.notifyListeners()
  }

  handleInput(input: string): InputResult {
    const result = this.instance.handle_input(input)
    // Notify after input is processed so React can re-read stats
    this.notifyListeners()
    return InputResultSchema.parse(result)
  }

  getStats(currentTimestamp: number): GameStats {
    // Return cached stats if available to maintain referential equality
    if (this.cachedStats) {
      return this.cachedStats
    }

    const stats = this.instance.get_stats(currentTimestamp)
    const parsed = GameStatsSchema.parse(stats)
    this.cachedStats = parsed
    return parsed
  }

  getUserInput(): string {
    return this.instance.get_user_input()
  }

  getTargetUnits(): Array<CanonicalUnit> {
    const units = this.instance.get_target_units()
    return z.array(CanonicalUnitSchema).parse(units)
  }

  getUserUnits(): Array<CanonicalUnit> {
    const units = this.instance.get_user_units()
    return z.array(CanonicalUnitSchema).parse(units)
  }

  getCursor(): Array<CanonicalUnit> {
    const units = this.instance.get_cursor()
    return z.array(CanonicalUnitSchema).parse(units)
  }

  dismissError(): void {
    // If your WASM has a dismiss_error method, call it here
    // Otherwise, this is handled via getStats
    this.notifyListeners()
  }

  free(): void {
    this.listeners.clear()
    this.cachedStats = null
    this.instance.free()
  }
}

/**
 * Standalone canonicalize function
 */
export function canonicalizeText(input: string): Array<CanonicalUnit> {
  const wasmModule = loader.peek()
  if (!wasmModule) {
    throw new Error("WASM module not loaded. Call loadWasm() first.")
  }
  const result = wasmModule.canonicalize_text(input)
  return z.array(CanonicalUnitSchema).parse(result)
}

/**
 * Build the display map (JS-friendly)
 */
export function buildDisplayMap(input: string): Uint32Array {
  const wasmModule = loader.peek()
  if (!wasmModule) {
    throw new Error("WASM module not loaded. Call loadWasm() first.")
  }
  const result = wasmModule.build_display_map_from_code(input)
  return z.instanceof(Uint32Array).parse(result)
}

/**
 * Check if WASM is loaded
 */
export function isWasmLoaded(): boolean {
  return loader.isLoaded()
}

/**
 * Force reload the WASM module (useful for testing)
 */
export function resetWasm(): void {
  loader.reset()
}
