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
      // Adjust the path based on your build setup
      // For Vite: /leetype_wasm_bg.wasm
      // For webpack: require('./leetype_wasm_bg.wasm')
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
 * Type-safe wrapper around the WASM TypingGame
 */
export class TypedTypingGame {
  private instance: TypingGameWasm

  constructor(targetCode: string, maxConsecutiveErrors?: number) {
    if (!wasmModule) {
      throw new Error("WASM module not loaded. Call loadWasm() first.")
    }
    this.instance = new wasmModule.TypingGame(targetCode, maxConsecutiveErrors)
  }

  start(timestamp: number): void {
    this.instance.start(timestamp)
  }

  reset(): void {
    this.instance.reset()
  }

  handleInput(input: string): InputResult {
    const result = this.instance.handle_input(input)
    return InputResultSchema.parse(result)
  }

  getStats(currentTimestamp: number): GameStats {
    const stats = this.instance.get_stats(currentTimestamp)
    return GameStatsSchema.parse(stats)
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

  free(): void {
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
export function buildDisplayMap(input: string): Array<number> {
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
