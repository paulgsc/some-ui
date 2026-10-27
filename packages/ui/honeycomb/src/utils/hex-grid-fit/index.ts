import { assertNever } from "@some-ui/core-utils"

type HexGridFitStatus = "fit" | "shrunk" | "impossible"

export type ViewportSize = {
  width: number
  height: number
}

export type HexGridFitRequest = {
  /** Space available to render into, in px. */
  viewport: ViewportSize
  /** Radius the caller would render at given unlimited space. */
  requestedRadius: number
  /** Hex circumradius (px) the caller would render at given unlimited space. */
  preferredHexSize: number
  /**
   * Smallest on-screen hex circumradius (px) still considered legible.
   * Below this, the grid is reported as impossible to render rather than
   * shrunk further.
   * @default 18
   */
  minHexSize?: number
  /** Space to reserve on every edge before fitting, in px. @default 0 */
  padding?: number
}

export type HexGridFitResult = {
  /** Radius to actually generate. */
  radius: number
  /** Hex circumradius (px) to actually generate at. */
  hexSize: number
  status: HexGridFitStatus
  /** `false` only for `"impossible"`. */
  canFit: boolean
  /** Human-readable explanation, present whenever `status !== "fit"`. */
  warning?: string
  /**
   * Natural (unscaled) pixel size of the grid described by `radius` +
   * `hexSize`. Rendering should letterbox-scale this down to fit the
   * viewport rather than redraw it — see `measureHexGridBounds`.
   */
  bounds: ViewportSize
}

const DEFAULT_MIN_HEX_SIZE = 18
const DEFAULT_PADDING = 0

/**
 * Exact pixel bounding box of a complete pointy-top hex grid of the given
 * radius, matching the `hex_to_pixel` layout the Rust/WASM grid renders
 * with (crates/some-hexagon/src/utils.rs): cell centers span
 * `sqrt(3) * (2*radius + 1)` wide and `3*radius + 2` tall in units of
 * `hexSize`. A single hexagon's own extent beyond its center is
 * `hexSize * sqrt(3)/2` horizontally and `hexSize` vertically, and — since
 * every cell shares the same six corner offsets regardless of position —
 * that extent adds uniformly to the bounding box of the cell centers
 * (bbox of a Minkowski sum). The result is an exact closed form: no need
 * to generate a grid just to measure it.
 */
export function measureHexGridBounds(
  radius: number,
  hexSize: number
): ViewportSize {
  const safeRadius = Math.max(0, radius)
  const safeHexSize = Math.max(0, hexSize)
  return {
    width: safeHexSize * Math.sqrt(3) * (2 * safeRadius + 1),
    height: safeHexSize * (3 * safeRadius + 2),
  }
}

function maxHexSizeForRadius(radius: number, available: ViewportSize): number {
  const unit = measureHexGridBounds(radius, 1)
  if (unit.width <= 0 || unit.height <= 0) return 0
  return Math.min(available.width / unit.width, available.height / unit.height)
}

function fitWarning(status: HexGridFitStatus): string | undefined {
  switch (status) {
    case "fit": {
      return undefined
    }
    case "shrunk": {
      return "Grid scaled down to fit the available space."
    }
    case "impossible": {
      return undefined
    }
    default: {
      return assertNever(status)
    }
  }
}

/**
 * Negotiates a hex grid size that fits inside `viewport` (#760): try the
 * preferred size, shrink it down to `minHexSize`, else report
 * `"impossible"`. The radius never changes: game state is keyed by cell id,
 * and a smaller radius would drop the outer ring.
 *
 * Pure function: no DOM, no ResizeObserver, no WASM, no React.
 */
export function fitHexGrid({
  viewport,
  requestedRadius,
  preferredHexSize,
  minHexSize = DEFAULT_MIN_HEX_SIZE,
  padding = DEFAULT_PADDING,
}: HexGridFitRequest): HexGridFitResult {
  const available: ViewportSize = {
    width: Math.max(0, viewport.width - padding * 2),
    height: Math.max(0, viewport.height - padding * 2),
  }

  const radius = Math.max(0, Math.floor(requestedRadius))
  const maxSize = maxHexSizeForRadius(radius, available)

  if (maxSize >= minHexSize) {
    const status: HexGridFitStatus =
      maxSize >= preferredHexSize ? "fit" : "shrunk"
    return {
      radius,
      hexSize: preferredHexSize,
      status,
      canFit: true,
      warning: fitWarning(status),
      bounds: measureHexGridBounds(radius, preferredHexSize),
    }
  }

  const bounds = measureHexGridBounds(radius, minHexSize)
  return {
    radius,
    hexSize: minHexSize,
    status: "impossible",
    canFit: false,
    warning: `Viewport too small to render the grid legibly. Minimum required: ${Math.ceil(bounds.width)}×${Math.ceil(bounds.height)}px.`,
    bounds,
  }
}
