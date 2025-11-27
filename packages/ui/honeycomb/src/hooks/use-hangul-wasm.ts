import { useCallback, useEffect, useRef, useState } from "react"
import type {
  GameConfig,
  GameMode,
  WasmHangulGameCore,
} from "@honeycomb/lib/hangul/wasm-game-bridge"
import {
  DEFAULT_GAME_CONFIG,
  WasmGameBridge,
} from "@honeycomb/lib/hangul/wasm-game-bridge"

// ============================================================================
// WASM MODULE TYPE
// ============================================================================

type WasmModule = {
  default: () => Promise<void>
  HangulGameCore: {
    new (
      config: GameConfig,
      mode: GameMode,
      gameDurationSeconds?: number
    ): WasmHangulGameCore
  }
}

// ============================================================================
// HOOK OPTIONS
// ============================================================================

export type UseHangulGameWasmOptions = {
  config?: Partial<GameConfig>
  autoStart?: boolean
  mode: GameMode
  gameDurationSeconds?: number
}

export type UseHangulGameWasmReturn = {
  isLoading: boolean
  error: string | null
  gameBridge: WasmGameBridge | null
  wasmCore: WasmHangulGameCore | null
  initialize: () => Promise<void>
  isInitialized: boolean
}

// ============================================================================
// WASM LOADER
// ============================================================================

async function loadWasmModule(): Promise<WasmModule> {
  try {
    const wasmModule = (await import(
      "hangul-game-core"
    )) as unknown as WasmModule
    await wasmModule.default()
    return wasmModule
  } catch (error) {
    console.error("Failed to load WASM module:", error)
    throw new Error(
      `Failed to load WASM module: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// ============================================================================
// HOOK
// ============================================================================

export function useHangulGameWasm({
  config,
  mode,
  gameDurationSeconds,
  autoStart = true,
}: UseHangulGameWasmOptions): UseHangulGameWasmReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  const wasmCoreRef = useRef<WasmHangulGameCore | null>(null)
  const gameBridgeRef = useRef<WasmGameBridge | null>(null)
  const initializingRef = useRef(false)

  const initialize = useCallback(async () => {
    if (initializingRef.current) {
      console.log("WASM initialization already in progress")
      return
    }

    initializingRef.current = true
    setIsLoading(true)
    setError(null)

    try {
      console.log("Loading WASM module...")
      const wasmModule = await loadWasmModule()

      // Merge with default config
      const finalConfig: GameConfig = {
        ...DEFAULT_GAME_CONFIG,
        ...config,
      }

      console.log("Creating game core with config:", finalConfig)
      const core = new wasmModule.HangulGameCore(
        finalConfig,
        mode,
        gameDurationSeconds
      )
      wasmCoreRef.current = core

      console.log("Creating game bridge...")
      const bridge = new WasmGameBridge(core, mode)
      gameBridgeRef.current = bridge

      setIsInitialized(true)
      console.log("✅ WASM game initialized successfully")
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to initialize WASM"
      console.error("Error initializing WASM game:", err)
      setError(errorMessage)
      wasmCoreRef.current = null
      gameBridgeRef.current = null
      setIsInitialized(false)
    } finally {
      setIsLoading(false)
      initializingRef.current = false
    }
  }, [config])

  useEffect(() => {
    if (autoStart && !isInitialized && !isLoading && !initializingRef.current) {
      initialize()
    }
  }, [autoStart, initialize, isInitialized, isLoading])

  useEffect(() => {
    // Return a cleanup function that only executes when the component unmounts.
    // The empty dependency array ensures this effect only runs once after the initial render.
    return () => {
      console.log("Cleanup: Setting WASM refs to null on unmount.")
      // Note: If you need to explicitly call a WASM 'destroy' or 'free' method,
      // you should do it here using the ref *before* setting it to null.
      // wasmCoreRef.current?.destroy();
      wasmCoreRef.current = null
      gameBridgeRef.current = null
    }
  }, [])

  return {
    isLoading,
    error,
    gameBridge: gameBridgeRef.current,
    wasmCore: wasmCoreRef.current,
    initialize,
    isInitialized,
  }
}
