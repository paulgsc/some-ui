import type { WasmViewportManager } from "@some-ui/polyhedron"
import { createWasmLoader } from "@some-ui/wasm-loader"

const loader = createWasmLoader<WasmViewportManager>({
  importModule: async () => {
    const module = await import("@some-ui/polyhedron")
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
