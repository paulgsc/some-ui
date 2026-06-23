import type {
  Disposable,
  FaceAction,
  FaceContent,
  ViewportCreateOptions,
} from "@conveyor/types"

import { CubeRenderer } from "./cube-renderer"
import type { EffectBus } from "./effect-bus"
import type { ThemeEngine } from "./theme-engine"
import type { ViewportHandle, WasmBridge } from "./wasm-bridge"

export type CubeInstanceOptions = {
  cubeId: string
  viewportOpts: ViewportCreateOptions
  faceContents: Array<FaceContent>
  faceActions: Partial<Record<number, FaceAction>>
  cubeWidth: number
  cubeHeight: number
}

/**
 * CubeInstance
 *
 * A first-class interactive entity. Owns:
 *   Viewport      — WASM state machine bridge (one per cube, never shared)
 *   CubeRenderer  — DOM construction + CSS transforms
 *   ThemeSlot     — reference to active CubeTheme (injected, not owned)
 *   EffectSlot    — per-face FaceAction map (dispatched via EffectBus)
 *   FaceContent[] — render surfaces, lazy + lifecycle-managed
 *
 * Does NOT own:
 *   - x-position (ConveyorEngine owns that)
 *   - rAF loop (ConveyorEngine owns that)
 *   - color/shadow values (ThemeEngine owns those)
 *   - action execution (EffectBus owns that)
 *
 * CubeInstance is the composition boundary.
 * Everything above it is orchestration.
 * Everything below it is implementation detail.
 */
export class CubeInstance implements Disposable {
  readonly id: string
  readonly renderer: CubeRenderer

  private viewport: ViewportHandle | null = null
  private isHovered = false
  private disposed = false

  constructor(
    private readonly opts: CubeInstanceOptions,
    private readonly wasmBridge: WasmBridge,
    private readonly themeEngine: ThemeEngine,
    private readonly effectBus: EffectBus
  ) {
    this.id = opts.cubeId

    this.renderer = new CubeRenderer(
      opts.cubeId,
      opts.cubeWidth,
      opts.cubeHeight
    )

    this.renderer.setFaceContents(opts.faceContents)

    // Apply theme variables onto the cube wrapper element.
    this.themeEngine.applyToElement(this.renderer.el)

    // Wire hover → speed signalling (speed applied by ConveyorEngine via getSpeedFactor).
    this.renderer.onHoverEnter(() => {
      this.isHovered = true
    })
    this.renderer.onHoverLeave(() => {
      this.isHovered = false
    })

    // Wire face clicks → EffectBus.
    this.renderer.onFaceClick((faceIndex) => {
      const action = this.opts.faceActions[faceIndex]
      if (action) {
        this.effectBus.dispatch(action).catch((e) => {
          // eslint-disable-next-line no-console
          console.error("[CubeInstance] EffectBus dispatch error:", e)
        })
      }
      // Also call per-face onClick if defined.
      this.opts.faceContents[faceIndex]?.onClick?.()
    })
  }

  // ── Async init (WASM) ──────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    this.viewport = await this.wasmBridge.createViewport(this.opts.viewportOpts)
    // Render initial state immediately.
    this.syncRenderer()
  }

  // ── Per-frame update (called by ConveyorEngine) ────────────────────────────

  /**
   * Advance the WASM timeline by dt milliseconds.
   * Called once per rAF frame from ConveyorEngine with a speed-scaled dt.
   */
  tick(dtMs: number): void {
    if (!this.viewport || this.disposed) return
    this.viewport.tick(dtMs)
    this.syncRenderer()
  }

  /**
   * Seed this cube's rotation phase by a whole number of quarter turns, applied
   * once at pool build so the belt doesn't rotate in lockstep.
   *
   * The WASM scheduler advances its cycle position one quarter turn every
   * `itemsPerTurn` timeline items, so we advance the timeline that many item
   * boundaries. The timeline discards any remainder past an item's duration on
   * advance, so a single oversized tick crosses exactly one boundary and lands
   * the cube cleanly on the next item — meaning `quarterTurns * itemsPerTurn`
   * ticks land it exactly `quarterTurns` quarter turns ahead. The renderer is
   * synced once at the end, so no intermediate frames are painted.
   */
  seedQuarterTurns(quarterTurns: number, itemsPerTurn: number): void {
    if (!this.viewport || this.disposed) return
    const steps = Math.max(0, Math.trunc(quarterTurns)) * itemsPerTurn
    if (steps === 0) return
    // Larger than any plausible item duration → each tick advances exactly one
    // item boundary (remainder discarded), regardless of the item's real length.
    const STEP_MS = 3_600_000
    for (let s = 0; s < steps; s++) this.viewport.tick(STEP_MS)
    this.syncRenderer()
  }

  /**
   * Speed factor this cube requests from ConveyorEngine.
   * 0.25 when hovered (slow), 1.0 otherwise.
   * ConveyorEngine applies this to the conveyor-wide speed, not just this cube.
   * A hovered cube therefore slows the entire conveyor — intentional.
   */
  getSpeedFactor(): number {
    return this.isHovered ? 0.25 : 1.0
  }

  get domElement(): HTMLElement {
    return this.renderer.el
  }

  get xPosition(): number {
    // Read back from renderer's current transform.
    const m = new DOMMatrix(this.renderer.el.style.transform)
    return m.m41
  }

  setXPosition(x: number): void {
    this.renderer.setXPosition(x)
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private syncRenderer(): void {
    if (!this.viewport) return
    this.renderer.applyState(this.viewport.state, this.themeEngine.activeTheme)
  }

  // ── Disposable ─────────────────────────────────────────────────────────────

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.viewport?.dispose()
    this.viewport = null
    this.renderer.dispose()
  }
}
