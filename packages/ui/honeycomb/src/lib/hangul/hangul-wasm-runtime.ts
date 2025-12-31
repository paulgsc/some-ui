import type {
  GameConfig,
  GameMode,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import {
  DEFAULT_GAME_CONFIG,
  GameConfigSchema,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type { HangulGameCore } from "hangul-game-core"

enum RuntimeState {
  Idle = "idle",
  Loading = "loading",
  Loaded = "loaded",
  Failed = "failed",
}

let state: RuntimeState = RuntimeState.Idle
let wasmModule: any = null
let coreInstance: HangulGameCore | null
let bridgeInstance: WasmGameBridge | null = null
let loadPromise: Promise<WasmGameBridge | null> | null = null
let lastError: Error | null = null

// Runtime getters
export function getRuntimeState(): RuntimeState {
  return state
}
export function getLastError(): Error | null {
  return lastError
}
export function getCoreInstance(): HangulGameCore | null {
  return coreInstance
}
export function getBridgeInstance() {
  return bridgeInstance
}

/**
 * Load Hangul WASM module and initialize core & bridge
 * Lazy, singleton, race-safe
 */
export async function loadHangulWasm(
  config?: Partial<GameConfig>,
  mode: GameMode = "completion"
): Promise<WasmGameBridge | null> {
  if (bridgeInstance && state === RuntimeState.Loaded) return bridgeInstance
  if (loadPromise) return loadPromise

  state = RuntimeState.Loading
  lastError = null

  loadPromise = (async () => {
    try {
      const module = (await import("hangul-game-core")) as any
      await module.default()
      wasmModule = module

      // Merge defaults + partial config, validate with Zod
      const finalConfig = GameConfigSchema.parse({
        ...DEFAULT_GAME_CONFIG,
        ...config,
      })

      coreInstance = new wasmModule.HangulGameCore(finalConfig, mode)
      if (!coreInstance) throw new Error("coreInstance is undefined")
      bridgeInstance = new WasmGameBridge(coreInstance, mode)

      state = RuntimeState.Loaded
      return bridgeInstance
    } catch (err) {
      state = RuntimeState.Failed
      lastError = err instanceof Error ? err : new Error(String(err))
      coreInstance = null
      bridgeInstance = null
      loadPromise = null
      return null
    } finally {
      if (state === RuntimeState.Loaded) loadPromise = null
    }
  })()

  return loadPromise
}

/**
 * Reset runtime (HMR, test cleanup)
 */
export function resetHangulWasm(): void {
  state = RuntimeState.Idle
  wasmModule = null
  coreInstance = null
  bridgeInstance = null
  loadPromise = null
  lastError = null
}
