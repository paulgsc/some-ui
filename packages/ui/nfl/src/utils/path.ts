type Point = { x: number; y: number }

/**
 * Catmull-Rom to cubic Bezier smoothing
 * Fixes: Explicit return type, nullish coalescing, and undefined checks.
 */
export function smoothPath(
  points: Array<Point>,
  tension: number = 0.5
): string {
  if (points.length < 2) return ""

  const d: Array<string> = []

  // Guard against undefined, though length check handles this,
  // TS sometimes needs help in strict mode.
  const firstPoint = points[0]
  if (!firstPoint) return ""

  d.push(`M ${firstPoint.x} ${firstPoint.y}`)

  for (let i = 0; i < points.length - 1; i++) {
    // Use nullish coalescing (??) instead of OR (||)
    // and explicitly define types to satisfy the compiler
    const p0: Point = points[i - 1] ?? (points[i] as Point)
    const p1: Point = points[i] as Point
    const p2: Point = points[i + 1] as Point
    const p3: Point = points[i + 2] ?? p2

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension

    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension

    d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`)
  }

  return d.join(" ")
}
