import type { WasmTransition, WasmViewportState } from "some-types-utils"

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
  private disposed = false

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
    if (this.disposed) return

    try {
      const advanced = await this.viewport.tick(dtMs)
      if (this.disposed) return

      await this.handleStateUpdate(advanced)
    } catch (err) {
      if (!this.disposed) {
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
    if (this.tickTimer || this.disposed) return

    this.tickTimer = setInterval(async () => {
      if (this.paused || this.disposed) return
      await this.tick(intervalMs)
    }, intervalMs)
  }

  /**
   * Handle state updates and auto-rotation logic
   */
  private async handleStateUpdate(checkAdvance: boolean): Promise<void> {
    if (this.disposed) return

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
    if (this.disposed) return

    try {
      await this.viewport.transition(trans)
      if (this.disposed) return

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
      if (!this.disposed) {
        const message = err instanceof Error ? err.message : String(err)
        this.events.onError?.(message)
      }
    }
  }

  /**
   * Refresh state from viewport
   */
  async refreshState(): Promise<void> {
    if (this.disposed) return

    try {
      const state = await this.viewport.refreshState()
      if (this.disposed) return

      this.events.onState(state)
      this.lastFace = state.activeFace
      this.lastCursor = state.cursor
    } catch (err) {
      if (!this.disposed) {
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
    this.disposed = true
    this.stopAutoTick()
  }
}
