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
  forceReset?: boolean
): Promise<WasmGameBridge> {
  const instance = await loadHangulWasm(config, mode, wordPool, forceReset)
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
}: UseHangulGameWasmOptions): UseHangulGameWasmReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bridge, setBridge] = useState<WasmGameBridge | null>(null)

  const initializedRef = useRef(false)
  // The mode this hook instance last successfully initialized against - not
  // necessarily the current `mode` prop, if the caller re-renders with a
  // different mode on an already-initialized instance rather than
  // remounting. Compared below to force a fresh initialize() in that case,
  // instead of initializedRef's guard silently keeping the stale mode.
  const loadedModeRef = useRef<GameMode | null>(null)

  // Wrap inside useCallback to safely add it to useEffect dependency arrays
  const initialize = useCallback(async (): Promise<void> => {
    if (initializedRef.current && loadedModeRef.current === mode) return

    // This loader is a page-wide singleton with no concept of "session" -
    // only "what mode is currently loaded" (see loadHangulWasm's own doc
    // comment). A fresh hook instance's first init (a new HangulHexGrid
    // mount - a new session, per its caller's `key={session.id}`) must
    // force a real engine reset even if the singleton's last-loaded mode
    // already happens to equal `mode` (e.g. two different sessions both
    // playing "completion"), or the new session would silently inherit the
    // previous one's board/stats.
    const isFirstInitForThisInstance = !initializedRef.current

    setIsLoading(true)
    setError(null)

    try {
      const instance = await loadGameSystem(
        mode,
        config,
        wordPool,
        isFirstInitForThisInstance
      )
      setBridge(instance)
      setIsInitialized(true)
      initializedRef.current = true
      loadedModeRef.current = mode
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [mode, config, wordPool])

  // Explicit, safe autoStart initialization effect - also the mode-switch
  // path: a mode change re-creates `initialize` (mode is in its dep array
  // above), which re-runs this effect and, per initialize()'s own guard,
  // performs a fresh load rather than a no-op.
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
