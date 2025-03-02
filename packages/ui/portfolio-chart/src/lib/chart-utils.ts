import type { TradeData } from "@portfolio-chart/types/trade-data"

export function calculateRegressionLine(data: Array<TradeData>) {
  if (data.length < 2) return []

  const n = data.length
  const indices = Array.from({ length: n }, (_, i) => i)
  const values = data.map((d) => d.value)

  // Calculate means
  const meanX = indices.reduce((sum, x) => sum + x, 0) / n
  const meanY = values.reduce((sum, y) => sum + y, 0) / n

  // Calculate coefficients
  let numerator = 0
  let denominator = 0

  for (let i = 0; i < n; i++) {
    numerator += (indices[i] - meanX) * (values[i] - meanY)
    denominator += Math.pow(indices[i] - meanX, 2)
  }

  const slope = denominator !== 0 ? numerator / denominator : 0
  const intercept = meanY - slope * meanX

  // Generate points for the regression line
  return indices.map((x) => ({
    x,
    y: slope * x + intercept,
  }))
}

// Add smoothing to the regression line using moving average
export function smoothRegressionLine(
  points: Array<{ x: number; y: number }>,
  windowSize = 5
) {
  if (points.length < windowSize) return points

  const smoothed = []

  for (let i = 0; i < points.length; i++) {
    let sum = 0
    let count = 0

    for (
      let j = Math.max(0, i - Math.floor(windowSize / 2));
      j <= Math.min(points.length - 1, i + Math.floor(windowSize / 2));
      j++
    ) {
      sum += points[j].y
      count++
    }

    smoothed.push({
      x: points[i].x,
      y: sum / count,
    })
  }

  return smoothed
}
