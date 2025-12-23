import type { WasmViewportManager } from "polyhedron"
import type {
  ViewportConfig,
  WasmCycleName,
  WasmTransition,
  WasmViewportState,
} from "some-types-utils"
import {
  TransitionFactory,
  validateViewportConfig,
  validateWasmItems,
  validateWasmPolyhedronType,
  validateWasmTransition,
  validateWasmViewportState,
} from "some-types-utils"

/**
 * Viewport class - wraps a single viewport instance in the WASM manager
 * Provides idempotent, type-safe operations
 */
export class Viewport {
  private readonly id: string
  private readonly manager: WasmViewportManager
  private _state: WasmViewportState | null = null
  private _isInitialized = false

  constructor(
    id: string,
    manager: WasmViewportManager,
    initialState: WasmViewportState | null = null
  ) {
    this.id = id
    this.manager = manager
    this._state = initialState
    this._isInitialized = initialState !== null
  }

  /**
   * Get viewport ID
   */
  getId(): string {
    return this.id
  }

  /**
   * Check if viewport is initialized
   */
  isInitialized(): boolean {
    return this._isInitialized
  }

  /**
   * Get current state (cached)
   */
  getState(): WasmViewportState | null {
    return this._state
  }

  /**
   * Refresh state from WASM
   */
  async refreshState(): Promise<WasmViewportState> {
    try {
      const rawState = this.manager.getState(this.id)
      const state = validateWasmViewportState(rawState)
      this._state = state
      return state
    } catch (error) {
      throw new Error(`Failed to refresh viewport "${this.id}": ${error}`)
    }
  }

  /**
   * Apply transition and update state
   */
  async transition(transition: WasmTransition): Promise<WasmViewportState> {
    try {
      // Validate transition
      const validTransition = validateWasmTransition(transition)

      // Apply via WASM
      const rawState = this.manager.applyTransition(this.id, validTransition)
      const state = validateWasmViewportState(rawState)

      this._state = state
      return state
    } catch (error) {
      throw new Error(`Transition failed for viewport "${this.id}": ${error}`)
    }
  }

  /**
   * Convenience methods for common transitions
   */
  async nextItem(): Promise<WasmViewportState> {
    return this.transition(TransitionFactory.nextItem())
  }

  async rotateNext(): Promise<WasmViewportState> {
    return this.transition(TransitionFactory.rotateNext())
  }

  async rotatePrev(): Promise<WasmViewportState> {
    return this.transition(TransitionFactory.rotatePrev())
  }

  async jumpToFace(face: number): Promise<WasmViewportState> {
    return this.transition(TransitionFactory.jumpToFace(face))
  }

  async switchCycle(index: number): Promise<WasmViewportState> {
    return this.transition(TransitionFactory.switchCycle(index))
  }

  async switchCycleByKind(
    cycleName: WasmCycleName
  ): Promise<WasmViewportState> {
    return this.transition(TransitionFactory.switchCycleByKind(cycleName))
  }

  async jumpToContent(index: number): Promise<WasmViewportState> {
    return this.transition(TransitionFactory.jumpToContent(index))
  }

  /**
   * Tick time forward
   * @returns true if advanced to next item automatically
   */
  async tick(dtMs: number): Promise<boolean> {
    try {
      const advanced = this.manager.tick(this.id, dtMs)

      if (advanced) {
        // State changed, refresh it
        await this.refreshState()
      }

      return advanced
    } catch (error) {
      throw new Error(`Tick failed for viewport "${this.id}": ${error}`)
    }
  }

  /**
   * Get specific face content
   */
  getFaceContent(faceIndex: number): Array<number> {
    if (!this._state) return []
    return this._state.faceLayout[faceIndex] || []
  }

  /**
   * Get active face content
   */
  getActiveFaceContent(): Array<number> {
    if (!this._state) return []
    return this.getFaceContent(this._state.activeFace)
  }

  /**
   * Get current cursor position
   */
  getCursor(): number {
    return this._state?.cursor ?? 0
  }

  /**
   * Get progress through current item [0, 1]
   */
  getProgress(): number {
    return this._state?.progress ?? 0
  }

  /**
   * Get current cycle name
   */
  getCycleName(): string {
    return this._state?.cycleName ?? ""
  }

  /**
   * Check if a specific content index is currently active
   */
  isContentActive(contentIndex: number): boolean {
    return this._state?.cursor === contentIndex
  }

  /**
   * Check if a specific face is currently active
   */
  isFaceActive(faceIndex: number): boolean {
    return this._state?.activeFace === faceIndex
  }

  /**
   * Get all content indices across all faces
   */
  getAllVisibleContent(): Array<number> {
    if (!this._state) return []
    return this._state.faceLayout.flat()
  }

  /**
   * Dispose viewport (remove from manager)
   */
  dispose(): boolean {
    try {
      return this.manager.removeViewport(this.id)
    } catch (error) {
      console.error(`Failed to dispose viewport "${this.id}":`, error)
      return false
    }
  }

  /**
   * Serialize current state to JSON
   */
  toJSON(): WasmViewportState | null {
    return this._state
  }

  /**
   * Create a snapshot of current state
   */
  snapshot(): {
    id: string
    state: WasmViewportState | null
    initialized: boolean
  } {
    return {
      id: this.id,
      state: this._state,
      initialized: this._isInitialized,
    }
  }
}

/**
 * Factory for creating viewports with validation
 */
export class ViewportFactory {
  constructor(private manager: WasmViewportManager) {}

  /**
   * Create a new viewport with full validation
   */
  async create(config: ViewportConfig): Promise<Viewport> {
    // Validate entire config
    const validConfig = validateViewportConfig(config)

    try {
      // Validate sub-components explicitly
      const validItems = validateWasmItems(validConfig.items)
      const validPolyhedron = validateWasmPolyhedronType(validConfig.polyhedron)

      // Create via WASM
      const initialState = this.manager.createViewport(
        validConfig.id,
        validItems,
        validPolyhedron,
        validConfig.faceCapacity,
        validConfig.cycleName
      )

      const state = validateWasmViewportState(initialState)

      // Return wrapped viewport
      return new Viewport(validConfig.id, this.manager, state)
    } catch (error) {
      throw new Error(`Failed to create viewport "${validConfig.id}": ${error}`)
    }
  }

  /**
   * Create viewport from existing ID (if already exists in manager)
   */
  async fromExisting(id: string): Promise<Viewport> {
    try {
      const rawState = this.manager.getState(id)
      const state = validateWasmViewportState(rawState)
      return new Viewport(id, this.manager, state)
    } catch (error) {
      throw new Error(`Failed to load existing viewport "${id}": ${error}`)
    }
  }
}

/**
 * Type guard
 */
export function isViewport(value: unknown): value is Viewport {
  return value instanceof Viewport
}
