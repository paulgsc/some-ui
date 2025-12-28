import type {
  CanonicalUnit,
  GameStats,
  InputResult,
  TypingGameWasm,
  WasmModule,
} from "@input/types/leetype"
import {
  CanonicalUnitSchema,
  GameStatsSchema,
  InputResultSchema,
} from "@input/types/leetype"
import { z } from "zod"

let wasmModule: WasmModule | null = null
let wasmLoadPromise: Promise<WasmModule> | null = null

/**
 * Load the WASM module (singleton pattern)
 */
export async function loadWasm(): Promise<WasmModule> {
  if (wasmModule) {
    return wasmModule
  }
  if (wasmLoadPromise) {
    return wasmLoadPromise
  }
  wasmLoadPromise = (async () => {
    try {
      const wasm = await import("leetype-wasm")
      await wasm.default() // Initialize the WASM module
      wasmModule = wasm as unknown as WasmModule
      console.log("wasm leetype loaded successfully!")
      return wasmModule
    } catch (error) {
      wasmLoadPromise = null
      throw new Error(
        `Failed to load WASM module: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  })()
  return wasmLoadPromise
}

/**
 * Type-safe wrapper around the WASM TypingGame with React subscription support
 */
export class TypedTypingGame {
  private instance: TypingGameWasm
  private listeners = new Set<() => void>()
  private cachedStats: GameStats | null = null

  constructor(targetCode: string, maxConsecutiveErrors?: number) {
    if (!wasmModule) {
      throw new Error("WASM module not loaded. Call loadWasm() first.")
    }
    this.instance = new wasmModule.TypingGame(targetCode, maxConsecutiveErrors)
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
  return wasmModule !== null
}

/**
 * Force reload the WASM module (useful for testing)
 */
export function resetWasm(): void {
  wasmModule = null
  wasmLoadPromise = null
}
