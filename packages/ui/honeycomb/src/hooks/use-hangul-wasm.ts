// useHangulGameWasm.ts
import { useEffect, useRef, useState } from "react"
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

  const initialize = async () => {
    if (initializedRef.current) return
    setIsLoading(true)
    setError(null)

    try {
      const instance = await loadHangulWasm(config, mode)
      if (instance) {
        setBridge(instance)
        setIsInitialized(true)
        initializedRef.current = true
      } else {
        setError(getLastError()?.message ?? "Unknown error loading Hangul WASM")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  // autoStart effect
  useEffect(() => {
    if (autoStart) initialize()
  }, [autoStart, config, mode])

  // cleanup effect
  useEffect(() => {
    return () => {
      // optional: call any WASM destroy methods here
      // clear local refs
      setBridge(null)
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
