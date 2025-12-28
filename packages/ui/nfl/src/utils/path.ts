type Point = { x: number; y: number }

// Catmull-Rom to cubic Bezier smoothing
export function smoothPath(points: Array<Point>, tension = 0.5) {
  if (points.length < 2) return ""
  const d: Array<string> = []
  d.push(`M ${points[0].x} ${points[0].y}`)
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension
    d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`)
  }
  return d.join(" ")
}
