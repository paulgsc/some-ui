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
  /** Opaque session identity, forwarded to loadHangulWasm (see its doc). */
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
  // What this instance last initialized against. A rerender with a new mode
  // or sessionKey (either alone) forces a fresh initialize() past
  // initializedRef's guard.
  const loadedModeRef = useRef<GameMode | null>(null)
  const loadedSessionKeyRef = useRef<string | undefined>(undefined)
  // The vocabulary the engine was built with, so a pool that arrives after
  // mount (apps/www fetches it) is not discarded. Compared by identity: a
  // caller must not build its pool inline every render.
  const loadedWordPoolRef = useRef<Array<ChallengeSeed> | null>(null)

  const initialize = useCallback(async (): Promise<void> => {
    if (
      initializedRef.current &&
      loadedModeRef.current === mode &&
      loadedSessionKeyRef.current === sessionKey &&
      loadedWordPoolRef.current === wordPool
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
      loadedWordPoolRef.current = wordPool
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [mode, config, wordPool, sessionKey])

  // autoStart, and the mode/session/word-pool switch path: a change to any
  // re-creates `initialize` and re-runs this effect. A mid-session vocabulary
  // swap therefore resets the engine, score and streak included.
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
