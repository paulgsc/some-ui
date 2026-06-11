import type {
  CubeState,
  CubeTheme,
  FaceContent,
  FaceState,
  ViewportState,
} from "@conveyor/types"

import { CycleRotationAdapter } from "./cycle-rotation-adapter"

const FACE_COUNT = 6

/**
 * CubeRenderer
 *
 * Builds and owns the 3D cube DOM node.
 * Translates WasmViewportState → CSS transforms on each rAF frame.
 * Manages face visibility lifecycle (enter/exit callbacks, lazy render).
 *
 * This is a translation of the React DiceCard component to vanilla DOM.
 * Reference: packages/ui/slideshow/src/components/dice-card/index.tsx
 *
 * Critical separation:
 *   - CubeRenderer NEVER touches color strings, font names, or shadow values.
 *   - All visual properties come from CSS variables set by ThemeEngine.
 *   - CubeRenderer only sets transform, display, and class names.
 *
 * Face transform mapping (mirrors DiceCard):
 *   0 front  → translateZ(halfW)
 *   1 right  → rotateY(90deg) translateZ(halfW)
 *   2 back   → rotateY(180deg) translateZ(halfW)
 *   3 left   → rotateY(-90deg) translateZ(halfW)
 *   4 top    → rotateX(90deg) translateZ(halfH)
 *   5 bottom → rotateX(-90deg) translateZ(halfH)
 */
export class CubeRenderer {
  readonly el: HTMLElement // outer wrapper (translated by ConveyorEngine)
  private readonly scene: HTMLElement // perspective container
  private readonly cube: HTMLElement // transform-style: preserve-3d
  private readonly faceEls: Array<HTMLElement>

  private readonly rotationAdapter: CycleRotationAdapter
  private currentActiveFace = -1
  private renderedFaces = new Set<number>()
  private faceContents: Array<FaceContent> = []

  constructor(
    private readonly cubeId: string,
    private readonly cubeWidth: number,
    private readonly cubeHeight: number
  ) {
    this.rotationAdapter = new CycleRotationAdapter("cube:y")

    // Outer wrapper — ConveyorEngine moves this via translateX.
    this.el = document.createElement("div")
    this.el.className = "sc-cube-wrapper"
    this.el.dataset["cubeId"] = cubeId
    Object.assign(this.el.style, {
      position: "absolute",
      bottom: "0",
      width: `${cubeWidth}px`,
      height: `${cubeHeight}px`,
      pointerEvents: "auto",
    })

    // Perspective scene.
    this.scene = document.createElement("div")
    this.scene.className = "sc-scene"
    Object.assign(this.scene.style, {
      width: "100%",
      height: "100%",
      perspective: `${cubeWidth * 2.5}px`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    })

    // Cube — preserve-3d, will be rotated.
    this.cube = document.createElement("div")
    this.cube.className = "sc-cube"
    Object.assign(this.cube.style, {
      width: "100%",
      height: "100%",
      position: "relative",
      transformStyle: "preserve-3d",
      transition: `transform var(--transition-duration, 500ms) var(--transition-easing, ease)`,
    })

    // Build 6 face elements.
    this.faceEls = Array.from({ length: FACE_COUNT }, (_, i) => {
      const face = document.createElement("div")
      face.className = "sc-face"
      face.dataset["faceIndex"] = String(i)
      Object.assign(face.style, {
        position: "absolute",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backfaceVisibility: "hidden",
        overflow: "hidden",
      })
      this.applyFaceTransform(face, i)
      return face
    })

    // Assemble.
    for (const face of this.faceEls) this.cube.appendChild(face)
    this.scene.appendChild(this.cube)
    this.el.appendChild(this.scene)
  }

  // ── Content binding ────────────────────────────────────────────────────────

  setFaceContents(contents: Array<FaceContent>): void {
    this.faceContents = contents.slice(0, FACE_COUNT)
  }

  // ── Per-frame update (called by ConveyorEngine) ────────────────────────────

  /**
   * Apply new WASM viewport state.
   * Only mutates the DOM if something actually changed.
   */
  applyState(state: ViewportState, theme: CubeTheme): void {
    const { cyclePosition, cycleLength, activeFace, cycleName } = state

    // Update rotation axis if cycle type changed.
    const axis = cycleName
    this.rotationAdapter.setAxis(axis)

    // Compute rotation angles.
    const { xRotation, yRotation } = this.rotationAdapter.update(
      cyclePosition,
      cycleLength
    )

    this.cube.style.transform = `rotateX(${xRotation}deg) rotateY(${yRotation}deg)`

    // Face lifecycle — only call render/exit when face actually changes.
    if (activeFace !== this.currentActiveFace) {
      const prevFace = this.currentActiveFace
      this.currentActiveFace = activeFace

      // Exit previous face.
      if (prevFace >= 0 && prevFace < this.faceEls.length) {
        const prevContent = this.faceContents[prevFace]
        prevContent?.onExit?.()
        this.faceEls[prevFace]?.classList.remove("sc-face--active")
      }

      // Enter new face — lazy render.
      if (activeFace >= 0 && activeFace < this.faceEls.length) {
        const faceEl = this.faceEls[activeFace]
        const faceContent = this.faceContents[activeFace]

        if (faceEl) {
          if (faceContent && !this.renderedFaces.has(activeFace)) {
            const rendered = faceContent.render()
            faceEl.appendChild(rendered)
            this.renderedFaces.add(activeFace)
          }

          faceEl.classList.add("sc-face--active")
        }
      }
    }

    // Apply theme classes.
    const cubeState: CubeState = {
      cubeId: this.cubeId,
      attentionMode: "Active",
      speedFactor: 1,
      activeFace,
    }
    this.cube.className = theme.cubeClass(cubeState)

    for (let i = 0; i < this.faceEls.length; i++) {
      const faceState: FaceState = {
        faceIndex: i,
        isActive: i === activeFace,
        isHovered: false,
        rotationProgress: 0,
      }
      const faceEl = this.faceEls[i]
      if (faceEl) faceEl.className = theme.faceClass(faceState)
    }
  }

  setXPosition(x: number): void {
    this.el.style.transform = `translateX(${x}px)`
  }

  // ── Hover wiring ───────────────────────────────────────────────────────────

  onHoverEnter(cb: () => void): void {
    this.el.addEventListener("mouseenter", cb)
  }

  onHoverLeave(cb: () => void): void {
    this.el.addEventListener("mouseleave", cb)
  }

  onFaceClick(cb: (faceIndex: number) => void): void {
    for (let i = 0; i < this.faceEls.length; i++) {
      const faceEl = this.faceEls[i]
      if (!faceEl) continue
      const idx = i
      faceEl.addEventListener("click", (e) => {
        e.stopPropagation()
        cb(idx)
      })
    }
  }

  // ── Face transforms ────────────────────────────────────────────────────────

  private applyFaceTransform(el: HTMLElement, index: number): void {
    const halfW = this.cubeWidth / 2
    const halfH = this.cubeHeight / 2
    const transforms: Record<number, string> = {
      0: `translateZ(${halfW}px)`,
      1: `rotateY(90deg) translateZ(${halfW}px)`,
      2: `rotateY(180deg) translateZ(${halfW}px)`,
      3: `rotateY(-90deg) translateZ(${halfW}px)`,
      4: `rotateX(90deg) translateZ(${halfH}px)`,
      5: `rotateX(-90deg) translateZ(${halfH}px)`,
    }
    el.style.transform = transforms[index] ?? ""
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  dispose(): void {
    // Exit the currently active face.
    if (this.currentActiveFace >= 0) {
      this.faceContents[this.currentActiveFace]?.onExit?.()
    }
    this.el.remove()
    this.renderedFaces.clear()
  }
}
