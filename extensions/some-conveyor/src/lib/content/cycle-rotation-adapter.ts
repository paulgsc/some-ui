import type { RotationAngles, WasmCycleName } from "@conveyor/types"

/**
 * CycleRotationAdapter
 *
 * Plain-TS port of packages/utils/src/lib/polyhedron/use-cycle-rotation-adapter.ts.
 *
 * Translates discrete WASM cycle position (an integer face index in the current
 * rotation cycle) into continuous CSS rotation angles (xRotation, yRotation).
 *
 * Key invariant: shortest-path normalization.
 * When cycle position jumps from 3 → 0 (wrapping), the naïve angle would
 * jump 270° in the wrong direction. We normalize the delta so the rotation
 * always takes the shortest arc ≤ 180°.
 *
 * Usage (called once per rAF frame by CubeRenderer when viewport state changes):
 *
 *   const adapter = new CycleRotationAdapter("cube:y")
 *   const { xRotation, yRotation } = adapter.update(cyclePosition, cycleLength)
 *   el.style.transform = `rotateX(${xRotation}deg) rotateY(${yRotation}deg)`
 */
export class CycleRotationAdapter {
  private prevAngle = 0
  private currentAngle = 0

  constructor(private axis: WasmCycleName = "cube:y") {}

  /**
   * Update the adapter with new cycle state.
   * Returns the current rotation angles to apply via CSS transform.
   */
  update(cyclePosition: number, cycleLength: number): RotationAngles {
    if (cycleLength === 0) {
      return this.toAngles(this.currentAngle)
    }

    const degreesPerStep = 360 / cycleLength
    const rawTarget = cyclePosition * degreesPerStep

    let delta = rawTarget - this.prevAngle

    // Shortest-path normalization — always rotate ≤ 180°.
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360

    this.currentAngle = this.prevAngle + delta
    this.prevAngle = this.currentAngle

    return this.toAngles(this.currentAngle)
  }

  /** Switch rotation axis without resetting angle accumulator. */
  setAxis(axis: WasmCycleName): void {
    this.axis = axis
  }

  reset(): void {
    this.prevAngle = 0
    this.currentAngle = 0
  }

  private toAngles(angle: number): RotationAngles {
    return this.axis === "cube:x"
      ? { xRotation: angle, yRotation: 0 }
      : { xRotation: 0, yRotation: angle }
  }
}
