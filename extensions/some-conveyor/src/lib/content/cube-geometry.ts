import type { WasmCycleName } from "@conveyor/types"

/**
 * cube-geometry
 *
 * Pure, DOM-free math for the "apparent 3-D rotation" of a cube rendered with
 * CSS transforms. Isolated from CubeRenderer so it can be unit-tested without a
 * browser and reasoned about independently of the rAF/WASM plumbing.
 *
 * ── The problem ──────────────────────────────────────────────────────────────
 * CSS gives us a 2-D plane and fakes depth with `perspective` + `translateZ`.
 * A cube made of six full-size faces only *looks* like a solid box when:
 *
 *   1. The rotation axis matches the aspect ratio.
 *      A wide rectangle (w > h) rotated about Y swings its huge width through
 *      the Z plane → the side faces become stretched slabs no perspective can
 *      rescue. Wide rects must rotate about X (front→top→back→bottom); tall
 *      rects must rotate about Y (front→right→back→left). A true cube (w == h)
 *      may use either.
 *
 *   2. The box depth (translateZ of the faces in the cycle) equals HALF of the
 *      *smaller* in-plane dimension, so the cross-section in the rotation plane
 *      is square. Otherwise the box reads as a slab.
 *
 *   3. The faces perpendicular to the rotation axis (the ones never swept into
 *      view) are hidden for non-square rects — they would only ever appear as
 *      stretched slabs.
 *
 *   4. The perspective (focal distance) is large enough relative to the swept
 *      dimension that the leading face faces the viewer without ballooning, yet
 *      small enough to keep the box feeling three-dimensional.
 *
 * Face index convention (matches CubeRenderer + DiceCard reference):
 *   0 front · 1 right · 2 back · 3 left · 4 top · 5 bottom
 */

export type RotationAxis = "x" | "y"

export type CubeDims = {
  width: number
  height: number
}

export type FaceTransform = {
  /** CSS transform string positioning this face in 3-D space. */
  transform: string
  /**
   * True when this face would be stretched into a slab for the current axis +
   * aspect ratio and must be hidden so the box keeps clean topology. Only ever
   * true for non-square rects.
   */
  hidden: boolean
}

/** px tolerance below which a rect is treated as a square cube. */
const SQUARE_EPSILON = 0.5

/** Focal-distance tuning. Larger ⇒ flatter; smaller ⇒ more dramatic + distorted. */
const PERSPECTIVE_FACTOR = 3.5
const MIN_PERSPECTIVE = 700

/** True when width and height are close enough to treat the rect as a cube. */
export function isSquare(dims: CubeDims): boolean {
  return Math.abs(dims.width - dims.height) <= SQUARE_EPSILON
}

/**
 * Map a WASM cycle name to the CSS rotation axis it drives.
 * Kept in lockstep with CycleRotationAdapter: only `cube:x` rotates about X.
 */
export function axisForCycle(cycle: WasmCycleName): RotationAxis {
  return cycle === "cube:x" ? "x" : "y"
}

/**
 * Resolve the axis actually safe to rotate about, given the rect's aspect ratio.
 *
 * The WASM scheduler requests an axis, but a strongly non-square rect can only
 * be rotated about one axis without stretching. Aspect ratio wins for rects;
 * the requested axis is honored only for (near-)square cubes.
 */
export function resolveAxis(
  dims: CubeDims,
  requested: RotationAxis
): RotationAxis {
  if (isSquare(dims)) return requested
  return dims.width > dims.height ? "x" : "y"
}

/**
 * Dynamic perspective (focal distance) in px for a rect + axis.
 *
 * Based on the dimension swept into the Z plane by the rotation (Y sweeps
 * width, X sweeps height), with the larger in-plane dimension as a floor so a
 * big flat face still sits far enough from the camera to avoid edge stretch.
 */
export function computePerspective(dims: CubeDims, axis: RotationAxis): number {
  const swept = axis === "x" ? dims.height : dims.width
  const maxDim = Math.max(dims.width, dims.height)
  return Math.max(
    MIN_PERSPECTIVE,
    Math.round(Math.max(swept * PERSPECTIVE_FACTOR, maxDim * 1.5))
  )
}

/**
 * Compute the six face transforms for a rect rotating about `axis`.
 *
 * The faces in the rotation cycle sit at ±(half of the swept dimension) so the
 * cross-section is square; the perpendicular pair is hidden for non-square
 * rects. Back faces are flipped 180° about the rotation axis so their content
 * reads upright when they swing into view.
 */
export function computeFaceTransforms(
  dims: CubeDims,
  axis: RotationAxis
): Array<FaceTransform> {
  const halfW = dims.width / 2
  const halfH = dims.height / 2
  const square = isSquare(dims)

  if (axis === "x") {
    // Visible cycle: front → top → back → bottom. Depth governed by height.
    // Left/right would be slabs for non-square rects → hidden.
    return [
      { transform: `translateZ(${halfH}px)`, hidden: false }, // 0 front
      { transform: `rotateY(90deg) translateZ(${halfW}px)`, hidden: !square }, // 1 right
      { transform: `rotateX(180deg) translateZ(${halfH}px)`, hidden: false }, // 2 back
      { transform: `rotateY(-90deg) translateZ(${halfW}px)`, hidden: !square }, // 3 left
      { transform: `rotateX(90deg) translateZ(${halfH}px)`, hidden: false }, // 4 top
      { transform: `rotateX(-90deg) translateZ(${halfH}px)`, hidden: false }, // 5 bottom
    ]
  }

  // axis === "y" — visible cycle: front → right → back → left. Depth governed
  // by width. Top/bottom would be slabs for non-square rects → hidden.
  return [
    { transform: `translateZ(${halfW}px)`, hidden: false }, // 0 front
    { transform: `rotateY(90deg) translateZ(${halfW}px)`, hidden: false }, // 1 right
    { transform: `rotateY(180deg) translateZ(${halfW}px)`, hidden: false }, // 2 back
    { transform: `rotateY(-90deg) translateZ(${halfW}px)`, hidden: false }, // 3 left
    { transform: `rotateX(90deg) translateZ(${halfH}px)`, hidden: !square }, // 4 top
    { transform: `rotateX(-90deg) translateZ(${halfH}px)`, hidden: !square }, // 5 bottom
  ]
}
