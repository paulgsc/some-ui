import type {
  ChallengeSeed,
  GameConfig,
  GameMode,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import {
  DEFAULT_GAME_CONFIG,
  GameConfigSchema,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import type { HangulGameCore } from "@some-ui/hangul-game-core"
import type { WasmLoaderState } from "@some-ui/wasm-loader"
import { createWasmLoader } from "@some-ui/wasm-loader"

// Set immediately before load()/preload() so the in-flight importModule()
// call (if one starts) picks them up.
let pendingConfig: Partial<GameConfig> | undefined
let pendingMode: GameMode = "completion"
let pendingWordPool: Array<ChallengeSeed> = []
let coreInstance: HangulGameCore | null = null

// The mode actually baked into the currently-loaded HangulGameCore (set once
// importModule() finishes), distinct from pendingMode: a mode is "loaded",
// not merely "requested", only once the core exists. loadHangulWasm() uses
// this to detect a mode switch and force a fresh core - the loader below is
// a page-wide singleton (one WASM module, one HangulGameCore instance), so
// without this check, switching modes after the first successful load would
// silently keep running whichever mode was loaded first for the rest of the
// page session, no matter what a later loadHangulWasm() call passes in.
let loadedMode: GameMode | null = null

const loader = createWasmLoader<WasmGameBridge>({
  importModule: async () => {
    const module = await import("@some-ui/hangul-game-core")
    await module.default()

    // Merge defaults + partial config, validate with Zod
    const finalConfig = GameConfigSchema.parse({
      ...DEFAULT_GAME_CONFIG,
      ...pendingConfig,
    })

    const core = new module.HangulGameCore(
      finalConfig,
      pendingMode,
      pendingWordPool
    )
    coreInstance = core
    loadedMode = pendingMode
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
  mode: GameMode = "completion",
  wordPool: Array<ChallengeSeed> = []
): Promise<WasmGameBridge | null> {
  // A request for a mode other than the one currently loaded must force a
  // fresh core - see loadedMode's comment above for why the loader can't be
  // trusted to pick this up on its own.
  if (loadedMode !== null && loadedMode !== mode) {
    resetHangulWasm()
  }
  pendingConfig = config
  pendingMode = mode
  pendingWordPool = wordPool
  return loader.load()
}

/**
 * Reset runtime (HMR, test cleanup, mode switch)
 */
export function resetHangulWasm(): void {
  loader.reset()
  coreInstance = null
  loadedMode = null
}
