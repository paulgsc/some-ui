function normalizeColorIntensity(
  value: number,
  min: number,
  max: number
): number {
  if (min === max) return 0.5
  return (value - min) / (max - min)
}

type ColorIntensity = {
  color: string
  lightness: number
}

export function interpolateOklch(
  value: number,
  min: number,
  max: number,
  start: [number, number, number], // [L, C, H]
  end: [number, number, number]
): ColorIntensity {
  const intensity = normalizeColorIntensity(value, min, max)

  // Interpolate L, C, and H
  const L = start[0] + intensity * (end[0] - start[0])
  const C = start[1] + intensity * (end[1] - start[1])
  const H = start[2] + intensity * (end[2] - start[2])

  return { color: `oklch(${L}% ${C} ${H}deg)`, lightness: L }
}

export function getTextColor(lightness: number): string {
  return lightness < 50 ? "white" : "black" // Lightness threshold for contrast
}
