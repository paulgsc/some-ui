import type {
  AttentionMode,
  ConveyorConfig,
  Disposable,
  FaceAction,
  FaceContent,
  ViewportItemSpec,
} from "@conveyor/types"
import { DEFAULT_CONVEYOR_CONFIG } from "@conveyor/types"

import { CubeInstance } from "./cube-instance"
import type { EffectBus } from "./effect-bus"
import type { ThemeEngine } from "./theme-engine"
import type { WasmBridge } from "./wasm-bridge"

/**
 * ConveyorEngine
 *
 * Owns the single requestAnimationFrame loop for the entire extension.
 * Drives toroidal horizontal translation for all CubeInstances.
 * Manages the cube pool (viewport-driven count, with overscan buffer).
 *
 * Architecture invariants:
 *   - ONE rAF loop, never one per cube.
 *   - ONE ResizeObserver on the strip container.
 *   - Cubes are never destroyed on resize — they are repositioned.
 *   - On Suspended: rAF is cancelled. On resume: rAF restarts from now.
 *   - Speed factor is the minimum across all cube requests (one hovered cube
 *     slows the whole conveyor — intentional, matches the "slow" hover policy).
 *
 * Toroidal wrapping:
 *   When a cube's x-position falls below -cubeWidth, it is repositioned to
 *   (tailX + cubeGap) where tailX is the rightmost cube's x + cubeWidth.
 *   No DOM removal, no DOM creation. Just position arithmetic.
 */
export class ConveyorEngine implements Disposable {
  private readonly strip: HTMLElement
  private cubes: Array<CubeInstance> = []
  private rafId: number | null = null
  private lastTimestamp: number | null = null
  private suspended = false
  private viewportWidth = window.innerWidth

  private readonly resizeObserver: ResizeObserver
  private disposed = false

  constructor(
    mount: ShadowRoot | HTMLElement,
    private readonly wasmBridge: WasmBridge,
    private readonly themeEngine: ThemeEngine,
    private readonly effectBus: EffectBus,
    private readonly config: ConveyorConfig = DEFAULT_CONVEYOR_CONFIG,
    private readonly makeFaceContents: (cubeId: string) => Array<FaceContent>,
    private readonly makeFaceActions: (
      cubeId: string
    ) => Partial<Record<number, FaceAction>>,
    private readonly makeViewportItems: (
      cubeId: string
    ) => Array<ViewportItemSpec>
  ) {
    // Build the strip container.
    this.strip = document.createElement("div")
    // Static box as preset utilities; only the configured height stays inline.
    // (Individual cubes re-enable pointer events via their own utilities.)
    this.strip.className =
      "sc-strip relative w-full overflow-visible pointer-events-none"
    this.strip.style.height = `${config.stripHeight}px`
    mount.appendChild(this.strip)

    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(document.documentElement)
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    await this.buildCubePool()
    this.scheduleFrame()
  }

  suspend(): void {
    this.suspended = true
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.lastTimestamp = null
  }

  resume(): void {
    if (!this.suspended) return
    this.suspended = false
    this.scheduleFrame()
  }

  handleAttentionChange(mode: AttentionMode): void {
    if (mode === "Suspended") this.suspend()
    else if (this.suspended) this.resume()
  }

  // ── rAF loop ───────────────────────────────────────────────────────────────

  private scheduleFrame(): void {
    if (this.disposed || this.suspended) return
    this.rafId = requestAnimationFrame(this.frame.bind(this))
  }

  private frame(timestamp: number): void {
    if (this.disposed || this.suspended) return

    const dt =
      this.lastTimestamp !== null
        ? Math.min(timestamp - this.lastTimestamp, 100) // clamp to 100ms — avoids huge jumps on tab re-focus
        : 16
    this.lastTimestamp = timestamp

    // Speed factor: minimum across all cube requests.
    const speedFactor = this.computeSpeedFactor()

    // Effective dt passed to WASM (slower when hovered).
    const effectiveDt = dt * speedFactor

    // Pixels to advance this frame.
    const pxPerMs = this.viewportWidth / this.config.tConveyor
    const translateDelta = pxPerMs * dt * speedFactor

    // Update each cube.
    for (const cube of this.cubes) {
      // Advance WASM timeline.
      cube.tick(effectiveDt)

      // Advance x-position.
      const currentX = this.getCubeX(cube)
      const nextX = currentX - translateDelta
      cube.setXPosition(nextX)
    }

    // Toroidal reposition.
    this.reposition()

    this.scheduleFrame()
  }

  private computeSpeedFactor(): number {
    if (this.cubes.length === 0) return 1
    return Math.min(...this.cubes.map((c) => c.getSpeedFactor()))
  }

  // ── Position tracking ──────────────────────────────────────────────────────

  private getCubeX(cube: CubeInstance): number {
    const m = new DOMMatrix(cube.domElement.style.transform)
    return m.m41
  }

  private reposition(): void {
    const { cubeWidth, cubeGap } = this.config

    for (const cube of this.cubes) {
      if (this.getCubeX(cube) < -cubeWidth) {
        const tail = this.findTailX()
        cube.setXPosition(tail + cubeGap)
      }
    }
  }

  private findTailX(): number {
    const { cubeWidth } = this.config
    let max = -Infinity
    for (const cube of this.cubes) {
      const x = this.getCubeX(cube) + cubeWidth
      if (x > max) max = x
    }
    return max === -Infinity ? this.viewportWidth : max
  }

  // ── Cube pool ──────────────────────────────────────────────────────────────

  private async buildCubePool(): Promise<void> {
    const count = this.computeCubeCount()

    const { cubeWidth, cubeGap } = this.config
    const creations: Array<Promise<void>> = []

    for (let i = 0; i < count; i++) {
      const cubeId = `cube-${i}`
      const startX = i * (cubeWidth + cubeGap)

      const cube = new CubeInstance(
        {
          cubeId,
          viewportOpts: {
            id: cubeId,
            items: this.makeViewportItems(cubeId),
            polyhedron: { type: "cube" },
            faceCapacity: 3,
            cycleName: "cube:y",
          },
          faceContents: this.makeFaceContents(cubeId),
          faceActions: this.makeFaceActions(cubeId),
          cubeWidth: this.config.cubeWidth,
          cubeHeight: this.config.cubeHeight ?? this.config.cubeWidth,
        },
        this.wasmBridge,
        this.themeEngine,
        this.effectBus
      )

      cube.setXPosition(startX)
      this.strip.appendChild(cube.domElement)
      this.cubes.push(cube)

      creations.push(cube.initialize())
    }

    await Promise.all(creations)
  }

  private computeCubeCount(): number {
    const { cubeWidth, cubeGap, overscan } = this.config
    const visible = Math.ceil(this.viewportWidth / (cubeWidth + cubeGap))
    return visible + overscan * 2
  }

  // ── Resize handling ────────────────────────────────────────────────────────

  private onResize(): void {
    const newWidth = window.innerWidth
    if (newWidth === this.viewportWidth) return
    this.viewportWidth = newWidth
    // Cube positions remain valid — the toroidal wrapping will self-correct
    // within a few frames. No pool rebuild needed unless cube count changes.
    const needed = this.computeCubeCount()
    if (needed > this.cubes.length) {
      this.addCubes(needed - this.cubes.length)
    }
  }

  private addCubes(count: number): void {
    const { cubeWidth, cubeGap } = this.config
    for (let i = 0; i < count; i++) {
      const cubeId = `cube-${this.cubes.length}`
      const startX = this.findTailX() + cubeGap + i * (cubeWidth + cubeGap)

      const cube = new CubeInstance(
        {
          cubeId,
          viewportOpts: {
            id: cubeId,
            items: this.makeViewportItems(cubeId),
            polyhedron: { type: "cube" },
            faceCapacity: 3,
            cycleName: "cube:y",
          },
          faceContents: this.makeFaceContents(cubeId),
          faceActions: this.makeFaceActions(cubeId),
          cubeWidth: this.config.cubeWidth,
          cubeHeight: this.config.cubeHeight ?? this.config.cubeWidth,
        },
        this.wasmBridge,
        this.themeEngine,
        this.effectBus
      )

      cube.setXPosition(startX)
      this.strip.appendChild(cube.domElement)
      this.cubes.push(cube)
      cube
        .initialize()
        // eslint-disable-next-line no-console
        .catch((e) => console.error("[ConveyorEngine] cube init error:", e))
    }
  }

  // ── Disposable ─────────────────────────────────────────────────────────────

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    this.suspend()
    this.resizeObserver.disconnect()

    for (const cube of this.cubes) cube.dispose()
    this.cubes = []

    this.strip.remove()
  }
}
