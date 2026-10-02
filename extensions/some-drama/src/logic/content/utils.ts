// ── Utils ─────────────────────────────────────────────────────────────────────
// Pure functions only. No DOM, no global state.
// Each function does one thing; test in isolation.

/** Map a 0–10 rating to a 5-star string. */
export function starsFor(rating: number): string {
  const full = Math.round(rating / 2)
  return "★".repeat(full) + "☆".repeat(5 - full)
}

/** Human-readable label for completion likelihood (0–1). */
export function likelihoodLabel(p: number): string {
  if (p >= 0.85) return "Finishing ✓"
  if (p >= 0.6) return "Likely"
  if (p >= 0.35) return "On the fence"
  return "Dropping?"
}

/** Clamp a number to [lo, hi]. */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

type Point = { x: number; y: number }
type Size = { width: number; height: number }

/**
 * Where a box of `size` wanting to sit at `at` can sit wholly inside the
 * viewport, `margin` clear of its edges. A box bigger than the viewport keeps
 * its top-left corner on screen — the title and the controls are there.
 */
export function fitInViewport(
  at: Point,
  size: Size,
  viewport: Size,
  margin = 0
): Point {
  const maxX = Math.max(margin, viewport.width - size.width - margin)
  const maxY = Math.max(margin, viewport.height - size.height - margin)
  return { x: clamp(at.x, margin, maxX), y: clamp(at.y, margin, maxY) }
}
