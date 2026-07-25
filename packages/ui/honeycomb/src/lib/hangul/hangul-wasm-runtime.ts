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
// call (if one starts) picks them up. Only ever consulted on the attempt
// that actually constructs the core (see loadHangulWasm's own comment for
// why a later mode change does not need these re-read).
let pendingConfig: Partial<GameConfig> | undefined
let pendingMode: GameMode = "completion"
let pendingWordPool: Array<ChallengeSeed> = []
let coreInstance: HangulGameCore | null = null

// What's actually baked into the currently-loaded HangulGameCore (set on
// construction, and again by every changeMode call). loadHangulWasm() uses
// these two - independently - to detect either a mode switch or a session
// change on an already-loaded core. Neither is inferred from caller
// lifecycle timing (e.g. "is this the caller's first render"); both are
// explicit values the caller hands in, compared as data.
let loadedMode: GameMode | null = null
let loadedSessionKey: string | undefined

// True once importModule has actually run and constructed a core - as
// opposed to loadedMode's null-ness, which flips to non-null *during* that
// same construction, before loadHangulWasm's own post-await check runs (see
// loadHangulWasm's own comment for why this distinction matters).
let hasConstructedCore = false

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
    hasConstructedCore = true
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
 * Load Hangul WASM module and initialize core & bridge.
 * Lazy, singleton, race-safe: the WASM module and HangulGameCore are
 * constructed exactly once per page session, never rebuilt or re-imported -
 * `sessionKey` changes what state the existing engine is in, never whether
 * the WASM binary itself gets reloaded.
 *
 * A request for a mode different from the one currently loaded is a runtime
 * state transition on the *existing* core (GameEngine::set_mode /
 * HangulGameCore.changeMode, ADR 0004 §2(f)), not a reason to tear down and
 * reconstruct the WASM object - mode/word_pool are session lifecycle state
 * a player can legitimately change mid-session, the same way reset()
 * already changes stats/board state on the existing core.
 *
 * `sessionKey` covers what mode-diffing alone cannot: this loader has no
 * concept of "session" on its own - it only ever sees whatever the caller
 * hands it. Two *different* sessions that happen to both play, say,
 * "completion" mode are indistinguishable by mode alone, so without a
 * session identity the second session would silently inherit the first
 * one's board/stats. `sessionKey` is that identity: an opaque token this
 * function never interprets, only diffs against what it last saw -
 * `useHangulGameWasm` forwards whatever its own `sessionKey` option was
 * (ultimately `session.id`, published to the shared session-context store by
 * apps/www's SessionViewport and merged into this component's props by
 * OrchestratedYouTubeViewport's `extraProps` - see some-ui-utils's
 * session-context-store). The caller that actually knows when a
 * session has changed (the host app) is the one asserting that fact here;
 * this loader only ever reads and compares it - never decides on its own
 * that a "new session" must have started based on unrelated signals like
 * when a component happened to mount.
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
 * Reset runtime (HMR, test cleanup) - not part of the normal mode/session
 * switch flow anymore; see loadHangulWasm's own doc comment.
 */
export function resetHangulWasm(): void {
  loader.reset()
  coreInstance = null
  loadedMode = null
  loadedSessionKey = undefined
  hasConstructedCore = false
}
