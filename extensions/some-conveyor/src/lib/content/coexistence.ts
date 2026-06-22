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
 *   - On Suspended: shadow host hidden, pointer-events disabled.
 *     Callers (ConveyorEngine) must separately suspend their rAF loop.
 *     The runtime only controls visibility — it does not own the rAF.
 *
 *   - On Active/Reduced: shadow host visible, pointer-events enabled.
 *
 *   - While the window holds OS focus (and not Suspended): the overlay is
 *     dimmed (focus fade) and click-through, so it never interrupts the user
 *     looking at the page. It returns to full presence when the window blurs.
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

  // Cached inputs to the host-presentation decision (visibility / dim / clicks).
  private mode: AttentionMode
  private windowFocused: boolean

  constructor(styleUrl: string) {
    this.registry = new DisposableRegistry()
    this.shadowHost = this.registry.register(new ShadowHost(styleUrl))
    this.pageMonitor = this.registry.register(new PageMonitor())

    this.mode = this.pageMonitor.currentMode
    this.windowFocused = this.pageMonitor.windowFocused

    this.pageMonitor.onModeChange(this.handleModeChange.bind(this))
    this.pageMonitor.onFocusChange(this.handleFocusChange.bind(this))

    // Apply initial state.
    this.applyHostState()
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
    this.mode = mode
    this.applyHostState()
    this.emit("attentionChange", mode)
  }

  private handleFocusChange(focused: boolean): void {
    this.windowFocused = focused
    this.applyHostState()
  }

  /**
   * Reconcile the host element from the two orthogonal inputs:
   *   - AttentionMode → hard visibility (Suspended hides the host entirely).
   *   - window focus  → the soft focus fade. While the window holds focus the
   *     overlay dims to transparent (CSS effect) and stops intercepting clicks,
   *     so it never interrupts the user actually looking at the page. Blurred
   *     (the OBS-capture case), it stays fully present.
   */
  private applyHostState(): void {
    const visible = this.mode !== "Suspended"
    const dimmed = visible && this.windowFocused
    this.shadowHost.setVisibility(visible)
    this.shadowHost.setOverlayDimmed(dimmed)
    this.shadowHost.setPointerEvents(visible && !dimmed)
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
