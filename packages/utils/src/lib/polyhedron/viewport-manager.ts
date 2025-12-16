import type { ViewportConfig } from "some-types-utils"
import { validateViewportConfig } from "some-types-utils"

import type { Viewport } from "./viewport"
import { ViewportFactory } from "./viewport"
import { getWasmManager, isWasmLoaded, resetWasmRuntime } from "./wasm-runtime"

export class ViewportManager {
  private viewports: Map<string, Viewport> = new Map()
  private factory: ViewportFactory | null = null

  /**
   * Initialize manager (idempotent, async)
   *
   * This is now SIMPLE:
   * - Get WASM manager from runtime (runtime handles complexity)
   * - Create factory
   * - Done
   */
  async initialize(): Promise<void> {
    // Already initialized
    if (this.factory !== null) {
      return
    }

    // Get WASM manager (runtime handles loading, caching, retries)
    const wasmManager = await getWasmManager()

    if (wasmManager === null) return

    // Create factory
    this.factory = new ViewportFactory(wasmManager)

    console.log("✅ [ViewportManager] Initialized")
  }

  /**
   * Check if manager is ready (synchronous)
   */
  isReady(): boolean {
    return this.factory !== null && isWasmLoaded()
  }

  /**
   * Get or create viewport (idempotent)
   *
   * KEY BEHAVIOR:
   * - If viewport exists: return it
   * - If viewport doesn't exist: create it
   * - If WASM not loaded: initialize first
   */
  async getOrCreateViewport(config: ViewportConfig): Promise<Viewport> {
    // Ensure initialized
    await this.initialize()

    if (!this.factory) {
      throw new Error("ViewportManager not initialized")
    }

    // Validate config
    const validConfig = validateViewportConfig(config)

    // Check if exists
    const existing = this.viewports.get(validConfig.id)
    if (existing) {
      console.log(`♻️ [ViewportManager] Reusing viewport: ${validConfig.id}`)
      return existing
    }

    // Create new
    console.log(`🆕 [ViewportManager] Creating viewport: ${validConfig.id}`)
    const viewport = await this.factory.create(validConfig)
    this.viewports.set(validConfig.id, viewport)

    return viewport
  }

  /**
   * Get viewport by ID (no creation)
   */
  getViewport(id: string): Viewport | undefined {
    return this.viewports.get(id)
  }

  /**
   * Check if viewport exists
   */
  hasViewport(id: string): boolean {
    return this.viewports.has(id)
  }

  /**
   * Remove viewport
   */
  removeViewport(id: string): boolean {
    const viewport = this.viewports.get(id)

    if (!viewport) {
      return false
    }

    // Dispose viewport
    viewport.dispose()

    // Remove from registry
    this.viewports.delete(id)

    console.log(`🗑️ [ViewportManager] Removed viewport: ${id}`)
    return true
  }

  /**
   * List all viewport IDs
   */
  listViewportIds(): Array<string> {
    return Array.from(this.viewports.keys())
  }

  /**
   * Get all viewports
   */
  getAllViewports(): Array<Viewport> {
    return Array.from(this.viewports.values())
  }

  /**
   * Get viewport count
   */
  getViewportCount(): number {
    return this.viewports.size
  }

  /**
   * Clear all viewports (but keep manager initialized)
   */
  clearAll(): void {
    console.log(
      `🧹 [ViewportManager] Clearing ${this.viewports.size} viewports...`
    )

    // Dispose all viewports
    for (const viewport of this.viewports.values()) {
      viewport.dispose()
    }

    // Clear registry
    this.viewports.clear()

    console.log("✅ [ViewportManager] All viewports cleared")
  }

  getStats(): {
    initialized: boolean
    wasmLoaded: boolean
    viewportCount: number
    viewportIds: Array<string>
  } {
    return {
      initialized: this.factory !== null,
      wasmLoaded: isWasmLoaded(),
      viewportCount: this.viewports.size,
      viewportIds: this.listViewportIds(),
    }
  }

  async batchCreate(configs: Array<ViewportConfig>): Promise<Array<Viewport>> {
    await this.initialize()

    const results = await Promise.all(
      configs.map((config) => this.getOrCreateViewport(config))
    )

    return results
  }
}

/**
 * Shared instance (singleton by convention, not enforcement)
 */
const sharedManager = new ViewportManager()

/**
 * Get the shared viewport manager instance
 *
 * This is a CONVENTION, not a hard requirement.
 * You can create your own manager if needed:
 *
 * ```ts
 * const customManager = new ViewportManager();
 * ```
 */
export function getViewportManager(): ViewportManager {
  return sharedManager
}

/**
 * Reset shared manager (clears viewports)
 *
 * NOTE: This only clears the manager's viewport registry.
 * To reset WASM runtime, call resetWasmRuntime() separately.
 */
export function resetViewportManager(): void {
  console.log("🔄 [ViewportManager] Resetting shared manager...")
  sharedManager.clearAll()
}

/**
 * FULL reset (manager + WASM runtime)
 *
 * Use cases:
 * - Hot module reload
 * - Test cleanup
 * - Complete system reset
 */
export function resetViewportSystem(): void {
  console.log("🔄 [Viewport System] Full system reset...")

  // 1. Clear viewports
  resetViewportManager()

  // 2. Reset WASM runtime
  resetWasmRuntime()

  console.log("✅ [Viewport System] Full reset complete")
}

/**
 * Type guard
 */
export function isViewportManager(value: unknown): value is ViewportManager {
  return value instanceof ViewportManager
}
