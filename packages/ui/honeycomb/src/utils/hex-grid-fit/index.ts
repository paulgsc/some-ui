import { assertNever } from "@honeycomb/utils/error"

export type HexGridFitStrategy = "shrink-only" | "shrink-then-reduce"

type HexGridFitStatus = "fit" | "shrunk" | "reduced-radius" | "impossible"

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
   * Below this, cells are either dropped (radius reduction) or the grid is
   * reported as impossible to render, rather than shrunk further.
   * @default 18
   */
  minHexSize?: number
  /** Space to reserve on every edge before fitting, in px. @default 0 */
  padding?: number
  /**
   * `"shrink-only"` never changes `requestedRadius` — only how large the
   * grid is drawn. Use this whenever cell ids carry meaning beyond
   * rendering (e.g. game state keyed by cell id), since a smaller radius
   * makes outer-ring cells disappear entirely.
   *
   * `"shrink-then-reduce"` drops to smaller canonical radii once shrinking
   * alone can no longer keep cells legible. Safe only when the caller
   * doesn't depend on a specific fixed set of cell ids.
   *
   * @default "shrink-only"
   */
  strategy?: HexGridFitStrategy
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

function fitWarning(
  status: HexGridFitStatus,
  radius: number
): string | undefined {
  switch (status) {
    case "fit": {
      return undefined
    }
    case "shrunk": {
      return "Grid scaled down to fit the available space."
    }
    case "reduced-radius": {
      return `Grid reduced to radius ${radius} to fit the available space.`
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
 * Negotiates a hex grid radius/size that fits inside `viewport`, per the
 * layout-negotiation pipeline described in
 * https://github.com/paulgsc/some-ui/issues/760: try the preferred size,
 * then let it shrink (via CSS scaling of `bounds` — this function makes no
 * assumption about how rendering shrinks it) down to `minHexSize`, then —
 * only if `strategy` allows — drop to smaller canonical radii and repeat,
 * before finally reporting `"impossible"`.
 *
 * Pure function: no DOM, no ResizeObserver, no WASM, no React.
 */
export function fitHexGrid({
  viewport,
  requestedRadius,
  preferredHexSize,
  minHexSize = DEFAULT_MIN_HEX_SIZE,
  padding = DEFAULT_PADDING,
  strategy = "shrink-only",
}: HexGridFitRequest): HexGridFitResult {
  const available: ViewportSize = {
    width: Math.max(0, viewport.width - padding * 2),
    height: Math.max(0, viewport.height - padding * 2),
  }

  const safeRequestedRadius = Math.max(0, Math.floor(requestedRadius))
  const minRadius = strategy === "shrink-then-reduce" ? 0 : safeRequestedRadius

  for (let radius = safeRequestedRadius; radius >= minRadius; radius--) {
    const maxSize = maxHexSizeForRadius(radius, available)
    if (maxSize < minHexSize) continue

    const status: HexGridFitStatus =
      radius !== safeRequestedRadius
        ? "reduced-radius"
        : maxSize >= preferredHexSize
          ? "fit"
          : "shrunk"

    return {
      radius,
      hexSize: preferredHexSize,
      status,
      canFit: true,
      warning: fitWarning(status, radius),
      bounds: measureHexGridBounds(radius, preferredHexSize),
    }
  }

  const bounds = measureHexGridBounds(minRadius, minHexSize)
  return {
    radius: minRadius,
    hexSize: minHexSize,
    status: "impossible",
    canFit: false,
    warning: `Viewport too small to render the grid legibly. Minimum required: ${Math.ceil(bounds.width)}×${Math.ceil(bounds.height)}px.`,
    bounds,
  }
}
