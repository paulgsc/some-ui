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
import { createWasmLoader } from "@some-ui/wasm-loader"

// Set immediately before load()/preload() so an importModule() that starts
// picks them up. Read only when constructing the core; later mode changes go
// through changeMode.
let pendingConfig: Partial<GameConfig> | undefined
let pendingMode: GameMode = "completion"
let pendingWordPool: Array<ChallengeSeed> = []
let coreInstance: HangulGameCore | null = null

// What the loaded core holds (set on construction and by changeMode).
// loadHangulWasm() diffs each against the caller's explicit values to detect
// a mode switch or a session change.
let loadedMode: GameMode | null = null
let loadedSessionKey: string | undefined

// True once importModule has constructed a core. Unlike loadedMode, which is
// set during construction, it is captured before the await, so the call that
// constructs the core does not also call changeMode.
let hasConstructedCore = false

const loader = createWasmLoader<WasmGameBridge>({
  importModule: async () => {
    const module = await import("@some-ui/hangul-game-core")
    await module.default()

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
    hasConstructedCore = true
    return new WasmGameBridge(core, pendingMode)
  },
  errorPolicy: "resolve-null",
})

// Runtime getters
export function getLastError(): Error | null {
  return loader.getLastError()
}
export function getCoreInstance(): HangulGameCore | null {
  return coreInstance
}

/**
 * Load the Hangul WASM module and initialize core & bridge. Lazy, singleton,
 * race-safe: the module and HangulGameCore are constructed once per page.
 *
 * A different mode is a state transition on the existing core
 * (HangulGameCore.changeMode, ADR 0004 §2(f)), not a rebuild.
 *
 * `sessionKey` covers what mode-diffing cannot: two sessions playing the same
 * mode would otherwise share board/stats. It is an opaque token from the host
 * (ultimately `session.id`, via apps/www's session-context-store),
 * only diffed, never inferred from when a component mounted.
 */
export async function loadHangulWasm(
  config?: Partial<GameConfig>,
  mode: GameMode = "completion",
  wordPool: Array<ChallengeSeed> = [],
  sessionKey?: string
): Promise<WasmGameBridge | null> {
  const wasAlreadyConstructed = hasConstructedCore

  pendingConfig = config
  pendingMode = mode
  pendingWordPool = wordPool

  const bridge = await loader.load()

  const sessionChanged =
    wasAlreadyConstructed && loadedSessionKey !== sessionKey
  const modeChanged = wasAlreadyConstructed && loadedMode !== mode

  if (bridge && wasAlreadyConstructed && (modeChanged || sessionChanged)) {
    bridge.changeMode(mode, wordPool)
    loadedMode = mode
  }

  loadedSessionKey = sessionKey

  return bridge
}

/**
 * Reset runtime (HMR, test cleanup); mode and session switches go through
 * loadHangulWasm.
 *
 */
export function resetHangulWasm(): void {
  loader.reset()
  coreInstance = null
  loadedMode = null
  loadedSessionKey = undefined
  hasConstructedCore = false
}
