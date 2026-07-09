import type {
  GameConfig,
  GameMode,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import {
  DEFAULT_GAME_CONFIG,
  GameConfigSchema,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type { WasmLoaderState } from "@some-ui/wasm-loader"
import { createWasmLoader } from "@some-ui/wasm-loader"
import type { HangulGameCore } from "hangul-game-core"

// Set immediately before load()/preload() so the in-flight importModule()
// call (if one starts) picks them up. A later loadHangulWasm() call with
// different args while a load is already in flight or already loaded is a
// no-op on those args - matches the pre-canon behavior, which only ever
// consulted config/mode on the attempt that actually constructs the core.
let pendingConfig: Partial<GameConfig> | undefined
let pendingMode: GameMode = "completion"
let coreInstance: HangulGameCore | null = null

const loader = createWasmLoader<WasmGameBridge>({
  importModule: async () => {
    const module = await import("hangul-game-core")
    await module.default()

    // Merge defaults + partial config, validate with Zod
    const finalConfig = GameConfigSchema.parse({
      ...DEFAULT_GAME_CONFIG,
      ...pendingConfig,
    })

    const core = new module.HangulGameCore(finalConfig, pendingMode)
    coreInstance = core
    return new WasmGameBridge(core, pendingMode)
  },
  errorPolicy: "resolve-null",
})

// Runtime getters
export function getRuntimeState(): WasmLoaderState {
  return loader.getState()
}
export function getLastError(): Error | null {
  return loader.getLastError()
}
export function getCoreInstance(): HangulGameCore | null {
  return coreInstance
}
export function getBridgeInstance(): WasmGameBridge | null {
  return loader.peek()
}

/**
 * Load Hangul WASM module and initialize core & bridge
 * Lazy, singleton, race-safe
 */
export async function loadHangulWasm(
  config?: Partial<GameConfig>,
  mode: GameMode = "completion"
): Promise<WasmGameBridge | null> {
  pendingConfig = config
  pendingMode = mode
  return loader.load()
}

/**
 * Reset runtime (HMR, test cleanup)
 */
export function resetHangulWasm(): void {
  loader.reset()
  coreInstance = null
}
