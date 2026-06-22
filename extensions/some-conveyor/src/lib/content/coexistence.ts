import type { AttentionMode, Disposable } from "@conveyor/types"

import { DisposableRegistry } from "./disposable-registry"
import { PageMonitor } from "./page-monitor"
import { ShadowHost } from "./shadow-host"

export type RuntimeEventMap = {
  attentionChange: AttentionMode
}

type RuntimeListener<K extends keyof RuntimeEventMap> = (
  payload: RuntimeEventMap[K]
) => void

/**
 * CoexistenceRuntime
 *
 * The extension's operating system. Owns:
 *
 *   PageMonitor        — observes page attention state
 *   ShadowHost         — isolated DOM container
 *   DisposableRegistry — deterministic cleanup
 *
 * All other subsystems (ConveyorEngine, CubeInstances, EffectBus) register
 * themselves with the runtime so they are torn down correctly.
 *
 * Extension-specific rules enforced here:
 *
 *   - On Suspended (hidden tab, focused window, or fullscreen): the overlay
 *     fades out, goes click-through, and detaches from layout/paint, so it
 *     never burns CPU or intercepts clicks behind a page the user is reading.
 *     Callers (ConveyorEngine) must separately suspend their rAF loop — the
 *     runtime owns the visible surface, not the rAF.
 *
 *   - On Active/Reduced (a foreground tab in a blurred window — the capture
 *     case): shadow host visible and interactive, belt running.
 *
 *   - Runtime is a singleton per content script execution.
 *     If the same page reloads or SPA navigates, dispose() and recreate.
 */
export class CoexistenceRuntime implements Disposable {
  readonly registry: DisposableRegistry
  readonly shadowHost: ShadowHost
  readonly pageMonitor: PageMonitor

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private readonly eventListeners = new Map<
    keyof RuntimeEventMap,
    Set<RuntimeListener<any>>
  >()
  /* eslint-enable @typescript-eslint/no-explicit-any */

  private disposed = false

  constructor(styleUrl: string) {
    this.registry = new DisposableRegistry()
    this.shadowHost = this.registry.register(new ShadowHost(styleUrl))
    this.pageMonitor = this.registry.register(new PageMonitor())

    this.pageMonitor.onModeChange(this.handleModeChange.bind(this))

    // Apply initial state.
    this.applyMode(this.pageMonitor.currentMode)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register an external subsystem for lifecycle management.
   * Returns the subsystem so callers can chain: const eng = runtime.register(new ConveyorEngine(...))
   */
  register<T extends Disposable>(d: T): T {
    return this.registry.register(d)
  }

  get attentionMode(): AttentionMode {
    return this.pageMonitor.currentMode
  }

  get mountPoint(): ShadowRoot {
    return this.shadowHost.mountPoint
  }

  on<K extends keyof RuntimeEventMap>(
    event: K,
    listener: RuntimeListener<K>
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(listener)
    return () => this.eventListeners.get(event)?.delete(listener)
  }

  // ── Mode handling ──────────────────────────────────────────────────────────

  private handleModeChange(mode: AttentionMode): void {
    this.applyMode(mode)
    this.emit("attentionChange", mode)
  }

  /**
   * Drive the host surface off the single attention mode. Suspended — a hidden
   * tab, a *focused* window, or fullscreen — yields: the overlay fades out, goes
   * click-through, and detaches from layout (ShadowHost.setActive). Active or
   * Reduced keep it live. The belt's rAF is suspended/resumed off the same
   * attentionChange event, so a yielded overlay costs nothing.
   */
  private applyMode(mode: AttentionMode): void {
    this.shadowHost.setActive(mode !== "Suspended")
  }

  private emit<K extends keyof RuntimeEventMap>(
    event: K,
    payload: RuntimeEventMap[K]
  ): void {
    const listeners = this.eventListeners.get(event)
    if (!listeners) return
    for (const listener of listeners) {
      try {
        listener(payload)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[CoexistenceRuntime]", e)
      }
    }
  }

  // ── Disposable ─────────────────────────────────────────────────────────────

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.eventListeners.clear()
    this.registry.dispose()
  }
}
