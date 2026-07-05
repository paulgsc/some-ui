import { useCallback, useEffect, useRef, useState } from "react"
import {
  getCoreInstance,
  getLastError,
  loadHangulWasm,
} from "@honeycomb/lib/hangul/hangul-wasm-runtime"
import type {
  GameConfig,
  GameMode,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"

export type UseHangulGameWasmOptions = {
  config?: Partial<GameConfig>
  autoStart?: boolean
  mode: GameMode
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
  config?: Partial<GameConfig>
): Promise<WasmGameBridge> {
  const instance = await loadHangulWasm(config, mode)
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
}: UseHangulGameWasmOptions): UseHangulGameWasmReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bridge, setBridge] = useState<WasmGameBridge | null>(null)

  const initializedRef = useRef(false)

  // Wrap inside useCallback to safely add it to useEffect dependency arrays
  const initialize = useCallback(async (): Promise<void> => {
    if (initializedRef.current) return

    setIsLoading(true)
    setError(null)

    try {
      const instance = await loadGameSystem(mode, config)
      setBridge(instance)
      setIsInitialized(true)
      initializedRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [mode, config])

  // Explicit, safe autoStart initialization effect
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
