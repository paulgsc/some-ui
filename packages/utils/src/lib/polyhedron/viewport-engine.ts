import type { WasmTransition, WasmViewportState } from "@some-ui/types"

import type { Viewport } from "./viewport"

type ViewportEngineEvents = {
  onState: (state: WasmViewportState) => void
  onFaceChange?: (newFace: number, oldFace: number) => void
  onContentAdvance?: (newCursor: number, oldCursor: number) => void
  onError?: (error: string) => void
}

export class ViewportEngine {
  private viewport: Viewport
  private events: ViewportEngineEvents
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private lastFace = -1
  private lastCursor = -1
  private paused = false
  private _disposed = false

  /**
   * Read through a method rather than off the field directly.
   *
   * Every `if (this.isDisposed()) return` after an `await` is guarding a real
   * hazard: `dispose()` can run while the awaited wasm call is in flight, and
   * continuing afterwards would emit state for a torn-down viewport.
   * TypeScript does not model that - it narrows `this._disposed` to `false`
   * from the guard at the top of the method and keeps that narrowing across
   * the await, so every re-check read as provably dead code.
   *
   * A call result is not narrowed, so this says what the field cannot: the
   * value can change under us, and re-reading it is the point.
   */
  private isDisposed(): boolean {
    return this._disposed
  }

  constructor(viewport: Viewport, events: ViewportEngineEvents) {
    this.viewport = viewport
    this.events = events

    // Initialize tracking values
    const state = viewport.getState()
    if (state) {
      this.lastFace = state.activeFace
      this.lastCursor = state.cursor
    }
  }

  /**
   * Update event callbacks without restarting engine
   */
  updateEvents(events: Partial<ViewportEngineEvents>): void {
    this.events = { ...this.events, ...events }
  }

  /**
   * Stop auto-tick loop
   */
  stopAutoTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }

  /**
   * Manual tick
   */
  async tick(dtMs: number): Promise<void> {
    if (this.isDisposed()) return

    try {
      const advanced = await this.viewport.tick(dtMs)
      if (this.isDisposed()) return

      this.handleStateUpdate(advanced)
    } catch (err) {
      if (!this.isDisposed()) {
        const message = err instanceof Error ? err.message : String(err)
        this.events.onError?.(message)
        // eslint-disable-next-line no-console
        console.error("Tick failed:", err)
      }
    }
  }

  /**
   * Start auto-tick loop
   */
  startAutoTick(intervalMs: number): void {
    if (this.tickTimer || this.isDisposed()) return

    this.tickTimer = setInterval(() => {
      if (this.paused || this.isDisposed()) return
      // Not awaited, and cannot be - a timer discards what its callback
      // returns. `tick` handles its own failures, so nothing is lost here
      // that an `async` callback would have caught.
      void this.tick(intervalMs)
    }, intervalMs)
  }

  /**
   * Handle state updates and auto-rotation logic
   */
  private handleStateUpdate(checkAdvance: boolean): void {
    if (this.isDisposed()) return

    const state = this.viewport.getState()
    if (!state) return

    this.emitStateChanges(state, checkAdvance)
  }

  /**
   * Emit state and change events
   */
  private emitStateChanges(
    state: WasmViewportState,
    wasAdvance: boolean
  ): void {
    this.events.onState(state)

    if (state.activeFace !== this.lastFace) {
      this.events.onFaceChange?.(state.activeFace, this.lastFace)
      this.lastFace = state.activeFace
    }

    if (wasAdvance && state.cursor !== this.lastCursor) {
      this.events.onContentAdvance?.(state.cursor, this.lastCursor)
      this.lastCursor = state.cursor
    }
  }

  /**
   * Apply transition
   */
  async transition(trans: WasmTransition): Promise<void> {
    if (this.isDisposed()) return

    try {
      await this.viewport.transition(trans)
      if (this.isDisposed()) return

      const state = this.viewport.getState()
      if (!state) return

      this.events.onState(state)

      if (state.activeFace !== this.lastFace) {
        this.events.onFaceChange?.(state.activeFace, this.lastFace)
        this.lastFace = state.activeFace
      }

      if (state.cursor !== this.lastCursor) {
        this.events.onContentAdvance?.(state.cursor, this.lastCursor)
        this.lastCursor = state.cursor
      }
    } catch (err) {
      if (!this.isDisposed()) {
        const message = err instanceof Error ? err.message : String(err)
        this.events.onError?.(message)
      }
    }
  }

  /**
   * Refresh state from viewport
   */
  async refreshState(): Promise<void> {
    if (this.isDisposed()) return

    try {
      const state = await this.viewport.refreshState()
      if (this.isDisposed()) return

      this.events.onState(state)
      this.lastFace = state.activeFace
      this.lastCursor = state.cursor
    } catch (err) {
      if (!this.isDisposed()) {
        const message = err instanceof Error ? err.message : String(err)
        this.events.onError?.(message)
        // eslint-disable-next-line no-console
        console.error("Refresh failed:", err)
      }
    }
  }

  /**
   * Pause auto-tick
   */
  pause(): void {
    this.paused = true
  }

  /**
   * Resume auto-tick
   */
  resume(): void {
    this.paused = false
  }

  /**
   * Get current paused state
   */
  isPaused(): boolean {
    return this.paused
  }

  /**
   * Get viewport instance
   */
  getViewport(): Viewport {
    return this.viewport
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this._disposed = true
    this.stopAutoTick()
  }
}
