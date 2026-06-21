// ─── Lifecycle ────────────────────────────────────────────────────────────────

export type Disposable = {
  dispose(): void
}

// ─── Attention / visibility ───────────────────────────────────────────────────

/**
 * Three-state attention model.
 *
 * Active    – normal browsing, conveyor runs at full speed
 * Reduced   – user is typing / hovering / interacting with page content
 *             conveyor slows but does not stop
 * Suspended – fullscreen video, tab hidden, or explicit pause
 *             rAF cancelled, WASM ticks paused, DOM hidden
 */
export type AttentionMode = "Active" | "Reduced" | "Suspended"

// ─── Face content contract ────────────────────────────────────────────────────

/**
 * A face is a render surface, not a component.
 * render() is called only when the face becomes active.
 * onExit() MUST cancel any timers or observers started by render().
 */
export type FaceContent = {
  readonly id: string

  /** Called once when this face rotates into view. Must be idempotent. */
  render(): HTMLElement

  /** Called when this face rotates out of view. Must clean up completely. */
  onExit?(): void

  /** Called on pointer click while the face is visible. */
  onClick?(): void

  /**
   * When true, the ConveyorEngine slows this cube while the face is active
   * and pointer is inside. Defaults to true.
   */
  readonly slowOnHover?: boolean
}

// ─── Effect system ────────────────────────────────────────────────────────────

/**
 * A FaceAction is a pure description of browser-level intent.
 * The cube emits it; the EffectBus executes it.
 * The cube never knows how any of these are implemented.
 */
export type FaceAction =
  | { type: "OpenTab"; url: string }
  | { type: "FocusTab"; url: string }
  | { type: "TogglePlayback"; tabId?: number }
  | { type: "ShowPopup" }
  | { type: "SendMessage"; payload: Record<string, unknown> }
  | { type: "LocalhostFetch"; path: string; method?: string; body?: unknown }
  | { type: "Noop" }

// ─── Theme system ─────────────────────────────────────────────────────────────

export type FaceState = {
  faceIndex: number
  isActive: boolean
  isHovered: boolean
  rotationProgress: number // 0..1 within current transition
}

export type CubeState = {
  cubeId: string
  attentionMode: AttentionMode
  speedFactor: number // 0..1, applied by ConveyorEngine
  activeFace: number
}

/**
 * CubeTheme is a pure data/function interface.
 * It knows nothing about WASM, DOM structure, or browser APIs.
 * Theming is entirely orthogonal to the logic layer.
 */
export type CubeTheme = {
  readonly name: string

  /**
   * CSS custom properties injected onto the cube host element.
   * Applied once at construction and on theme switch.
   */
  readonly cssVariables: Readonly<Record<string, string>>

  /** Returns a CSS class name for a given face state. */
  faceClass(state: FaceState): string

  /** Returns a CSS class name for the cube wrapper given cube state. */
  cubeClass(state: CubeState): string

  /** Duration in ms for the CSS face-transition animation. */
  readonly transitionDuration: number
}

// ─── Conveyor geometry ────────────────────────────────────────────────────────

export type ConveyorConfig = {
  /** Width of each cube in px. */
  cubeWidth: number
  /** Optional Height of each cube in px. falls back to cubeWidth */
  cubeHeight?: number
  /** Gap between cubes in px. */
  /** Gap between cubes in px. */
  cubeGap: number
  /** Height of the conveyor strip in px. */
  stripHeight: number
  /** Duration in ms for a cube to traverse the full viewport width. */
  tConveyor: number
  /** Extra cubes beyond what fills the viewport (one side). */
  overscan: number
}

export const DEFAULT_CONVEYOR_CONFIG: ConveyorConfig = {
  cubeWidth: 180,
  cubeGap: 16,
  stripHeight: 200,
  tConveyor: 30_000,
  overscan: 2,
}

// ─── Viewport / WASM bridge types ─────────────────────────────────────────────

/** Re-exported shape expected from WasmViewportManager.getState() */
export type ViewportState = {
  faceLayout: Array<Array<number>>
  activeFace: number
  activeItemInFace: number
  cursor: number
  cycleIndex: number
  cyclePosition: number
  cycleLength: number
  cycleName: WasmCycleName
  progress: number
}

export type ViewportItemSpec = {
  contentIndex: number
  durationMs: number
}

export type ViewportCreateOptions = {
  id: string
  items: Array<ViewportItemSpec>
  polyhedron:
    | { type: "cube" }
    | { type: "hexPrism" }
    | { type: "carousel"; faces: number }
  faceCapacity: number
  cycleName?: string
}

// ─── Rotation adapter ─────────────────────────────────────────────────────────

export type RotationAngles = {
  xRotation: number
  yRotation: number
}

export type WasmCycleName =
  | "cube:y"
  | "cube:x"
  | "hex:circumference"
  | "hex:vertical"
  | "carousel:circular"
