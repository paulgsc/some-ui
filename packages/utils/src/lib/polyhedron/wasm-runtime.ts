import { createWasmLoader } from "@some-ui/wasm-loader"
import type { WasmViewportManager } from "polyhedron"

const loader = createWasmLoader<WasmViewportManager>({
  importModule: async () => {
    const module = await import("polyhedron")
    if (typeof module.default === "function") {
      await module.default()
    }
    return new module.WasmViewportManager()
  },
  errorPolicy: "resolve-null",
})

/**
 * Check if WASM is loaded
 */
export function isWasmLoaded(): boolean {
  return loader.isLoaded()
}

/**
 * Get WASM manager instance (async, idempotent)
 * Handles loading, construction, retry-on-next-call, and race safety via
 * the canonical `@some-ui/wasm-loader`.
 */
export async function getWasmManager(): Promise<WasmViewportManager | null> {
  const manager = await loader.load()
  if (manager === null) {
    // eslint-disable-next-line no-console
    console.error("❌ [WASM Runtime] Load failed:", loader.getLastError())
  }
  return manager
}

/**
 * Get WASM manager synchronously (returns null if not loaded)
 * Useful for non-async contexts
 */
export function getWasmManagerSync(): WasmViewportManager | null {
  return loader.peek()
}

/**
 * Preload WASM (fire-and-forget)
 * Useful for warming up runtime before first use
 */
export function preloadWasm(): void {
  loader.preload()
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
  loader.reset()
}
