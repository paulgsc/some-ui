import { useCallback, useEffect, useRef, useState } from "react"
import { HANGUL_WORD_POOL } from "@honeycomb/data"
import {
  getCoreInstance,
  getLastError,
  loadHangulWasm,
} from "@honeycomb/lib/hangul/hangul-wasm-runtime"
import type {
  ChallengeSeed,
  GameConfig,
  GameMode,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"

export type UseHangulGameWasmOptions = {
  config?: Partial<GameConfig>
  autoStart?: boolean
  mode: GameMode
  /**
   * Word pool for "vocabulary"/"vocabulary-endless" modes; ignored by every
   * other mode. Defaults to the full seed vocabulary (@honeycomb/data) so
   * callers only need to override it for a curated subset.
   */
  wordPool?: Array<ChallengeSeed>
  /**
   * Opaque session/instance identity, forwarded to loadHangulWasm unchanged
   * - see its own doc comment for why this exists alongside mode-diffing.
   */
  sessionKey?: string
}

export type UseHangulGameWasmReturn = {
  isLoading: boolean
  isInitialized: boolean
  error: string | null
  gameBridge: WasmGameBridge | null
  wasmCore: typeof getCoreInstance | null
  initialize: () => Promise<void>
}

/**
 * Pure domain orchestrator.
 * Isolated from React state updates, making it completely deterministic.
 */
async function loadGameSystem(
  mode: GameMode,
  config?: Partial<GameConfig>,
  wordPool?: Array<ChallengeSeed>,
  sessionKey?: string
): Promise<WasmGameBridge> {
  const instance = await loadHangulWasm(config, mode, wordPool, sessionKey)
  if (!instance) {
    throw new Error(
      getLastError()?.message ?? "Unknown error loading Hangul WASM"
    )
  }
  return instance
}

export function useHangulGameWasm({
  config,
  mode,
  autoStart = true,
  wordPool = HANGUL_WORD_POOL,
  sessionKey,
}: UseHangulGameWasmOptions): UseHangulGameWasmReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bridge, setBridge] = useState<WasmGameBridge | null>(null)

  const initializedRef = useRef(false)
  // What this hook instance last successfully initialized against - not
  // necessarily the current props, if the caller re-renders with a new mode
  // and/or sessionKey on an already-initialized instance rather than
  // remounting. Compared below to force a fresh initialize() in that case,
  // instead of initializedRef's guard silently keeping the stale values.
  // Tracked as an explicit pair, not inferred from hook lifecycle timing:
  // mode can legitimately change mid-session (a live mode switch) and
  // sessionKey can legitimately stay the same across a mode switch or change
  // independent of mode (a new session that happens to reuse the same
  // mode) - either difference alone must trigger a fresh load.
  const loadedModeRef = useRef<GameMode | null>(null)
  const loadedSessionKeyRef = useRef<string | undefined>(undefined)

  // Wrap inside useCallback to safely add it to useEffect dependency arrays
  const initialize = useCallback(async (): Promise<void> => {
    if (
      initializedRef.current &&
      loadedModeRef.current === mode &&
      loadedSessionKeyRef.current === sessionKey
    ) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const instance = await loadGameSystem(mode, config, wordPool, sessionKey)
      setBridge(instance)
      setIsInitialized(true)
      initializedRef.current = true
      loadedModeRef.current = mode
      loadedSessionKeyRef.current = sessionKey
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [mode, config, wordPool, sessionKey])

  // Explicit, safe autoStart initialization effect - also the mode/session
  // switch path: a change to either re-creates `initialize` (both are in its
  // dep array above), which re-runs this effect and, per initialize()'s own
  // guard, performs a fresh load rather than a no-op.
  useEffect(() => {
    let active = true

    const triggerAutoStart = async (): Promise<void> => {
      if (autoStart && active) {
        await initialize()
      }
    }

    void triggerAutoStart()

    return (): void => {
      active = false
    }
  }, [autoStart, initialize])

  // System cleanup effect
  useEffect(() => {
    return (): void => {
      setBridge(null)
      initializedRef.current = false
    }
  }, [])

  return {
    isLoading,
    isInitialized,
    error,
    gameBridge: bridge,
    wasmCore: getCoreInstance,
    initialize,
  }
}
