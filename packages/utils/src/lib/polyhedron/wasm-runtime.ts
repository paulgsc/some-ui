import type { WasmViewportManager } from "polyhedron"

type WasmModule = unknown // Will be properly typed when WASM loads

/**
 * Runtime state machine
 */
enum RuntimeState {
  Idle = "idle",
  Loading = "loading",
  Loaded = "loaded",
  Failed = "failed",
}

/**
 * Global runtime state (private to this module)
 */
let state: RuntimeState = RuntimeState.Idle
let wasmModule: WasmModule | null = null
let managerInstance: WasmViewportManager | null = null // WasmViewportManager
let loadPromise: Promise<WasmViewportManager | null> | null = null
let lastError: Error | null = null

/**
 * Get current runtime state (read-only)
 */
export function getRuntimeState(): RuntimeState {
  return state
}

/**
 * Check if WASM is loaded
 */
export function isWasmLoaded(): boolean {
  return state === RuntimeState.Loaded && managerInstance !== null
}

/**
 * Get last error if failed
 */
export function getLastError(): Error | null {
  return lastError
}

/**
 * Get WASM manager instance (async, idempotent)
 * Handles:
 * - Loading WASM module (once)
 * - Constructing manager (once)
 * - Retry on failure
 * - Race condition safety
 */
export async function getWasmManager(): Promise<WasmViewportManager | null> {
  // Fast path: already loaded
  if (managerInstance && state === RuntimeState.Loaded) {
    return managerInstance
  }

  // If loading is in progress, join the existing promise
  if (loadPromise) {
    return loadPromise
  }

  // Start async loading
  state = RuntimeState.Loading
  lastError = null

  loadPromise = (async () => {
    try {
      const startTime = performance.now()

      console.log("📦 [WASM Runtime] Importing WASM module...")
      const module = await import("polyhedron")
      wasmModule = module
      if (typeof module.default === "function") {
        await module.default()
      }
      console.log(
        `✅ [WASM Runtime] Module imported in ${(
          performance.now() - startTime
        ).toFixed(2)}ms`
      )

      console.log("🏗️ [WASM Runtime] Constructing WasmViewportManager...")
      const constructStart = performance.now()
      managerInstance = new module.WasmViewportManager()
      console.log(
        `✅ [WASM Runtime] Manager constructed in ${(
          performance.now() - constructStart
        ).toFixed(2)}ms`
      )

      state = RuntimeState.Loaded
      console.log(
        `🎉 [WASM Runtime] Total initialization: ${(
          performance.now() - startTime
        ).toFixed(2)}ms`
      )

      return managerInstance
    } catch (err) {
      state = RuntimeState.Failed
      lastError = err instanceof Error ? err : new Error(String(err))
      managerInstance = null

      console.error("❌ [WASM Runtime] Load failed:", lastError)

      // Reset promise to allow retry next time
      loadPromise = null

      return null // caller can decide to retry
    } finally {
      // Clear loadPromise if manager loaded successfully, keep for retries if failed
      if (state === RuntimeState.Loaded) {
        loadPromise = null
      }
    }
  })()

  return loadPromise
}

/**
 * Get WASM manager synchronously (returns null if not loaded)
 * Useful for non-async contexts
 */
export function getWasmManagerSync(): WasmViewportManager | null {
  return managerInstance
}

/**
 * Preload WASM (fire-and-forget)
 * Useful for warming up runtime before first use
 */
export function preloadWasm(): void {
  if (state === RuntimeState.Idle) {
    console.log("🔥 [WASM Runtime] Preloading WASM...")
    getWasmManager().catch((err) => {
      console.warn("[WASM Runtime] Preload failed:", err)
    })
  }
}

/**
 * Reset WASM runtime (for HMR, tests, cleanup)
 *
 * IMPORTANT: This is a HARD reset that:
 * - Clears all state
 * - Forces reload on next getWasmManager()
 * - Does NOT dispose existing viewports (that's manager's job)
 *
 * Use cases:
 * - Hot module reload (Vite/Webpack HMR)
 * - Test cleanup (afterEach)
 * - Manual recovery from error state
 */
export function resetWasmRuntime(): void {
  console.log("🔄 [WASM Runtime] Resetting runtime...")

  const hadManager = managerInstance !== null

  state = RuntimeState.Idle
  wasmModule = null
  managerInstance = null
  loadPromise = null
  lastError = null

  if (hadManager) {
    console.log("✅ [WASM Runtime] Runtime reset complete")
  }
}

/**
 * Get runtime statistics (for debugging)
 */
export function getRuntimeStats(): {
  state: RuntimeState
  hasModule: boolean
  hasManager: boolean
  hasError: boolean
  errorMessage: string | null
} {
  return {
    state,
    hasModule: wasmModule !== null,
    hasManager: managerInstance !== null,
    hasError: lastError !== null,
    errorMessage: lastError?.message ?? null,
  }
}

/**
 * Type guard for runtime state
 */
export function isRuntimeLoaded(): boolean {
  return state === RuntimeState.Loaded
}

export function isRuntimeLoading(): boolean {
  return state === RuntimeState.Loading
}

export function isRuntimeFailed(): boolean {
  return state === RuntimeState.Failed
}

export function isRuntimeIdle(): boolean {
  return state === RuntimeState.Idle
}
