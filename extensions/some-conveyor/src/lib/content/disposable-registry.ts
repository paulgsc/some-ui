import type { Disposable } from "@conveyor/types"

/**
 * DisposableRegistry
 *
 * Every subsystem that allocates resources (rAF loops, observers, timers,
 * WASM viewports, DOM nodes) registers itself here. On extension teardown,
 * a single registry.dispose() call cleans everything deterministically.
 *
 * Prevents the most common extension bugs:
 *   - orphaned rAF loops running after content script reload
 *   - leaked event listeners multiplying across SPA navigations
 *   - WASM viewports never freed
 */
export class DisposableRegistry implements Disposable {
  private readonly entries = new Set<Disposable>()
  private disposed = false

  register<T extends Disposable>(d: T): T {
    if (this.disposed) {
      console.warn(
        "[DisposableRegistry] Registering after dispose — disposing immediately"
      )
      d.dispose()
      return d
    }
    this.entries.add(d)
    return d
  }

  unregister(d: Disposable): void {
    this.entries.delete(d)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    // Dispose in reverse-registration order so dependencies unwind correctly.
    const ordered = Array.from(this.entries).reverse()
    for (const entry of ordered) {
      try {
        entry.dispose()
      } catch (err) {
        console.error("[DisposableRegistry] Error during dispose:", err)
      }
    }
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }
}
