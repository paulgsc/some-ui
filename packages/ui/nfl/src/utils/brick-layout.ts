import type { BrickPosition } from "@nfl/types/brick-wall"

/**
 * Calculate brick positions according to the formal specification
 *
 * @param layerIndex - Zero-based index of the current layer (λ in the spec)
 * @param elementsInLayer - Number of bricks in this layer (n_j in the spec)
 * @param maxLayerWidth - Maximum width of any layer (M in the spec)
 * @param totalLayers - Total number of layers (L in the spec)
 * @param canvasWidth - Width of the canvas in pixels (W in the spec)
 * @param canvasHeight - Height of the canvas in pixels (H in the spec)
 * @param horizontalSpacingRatio - Horizontal spacing to size ratio (ρ_x in the spec)
 * @param verticalSpacingRatio - Vertical spacing to size ratio (ρ_y in the spec)
 * @param layoutMode - "pyramid" for centered or "wall" for right-aligned
 * @returns Array of brick positions
 */
export function calculateBrickPositions(
  layerIndex: number,
  elementsInLayer: number,
  maxLayerWidth: number,
  totalLayers: number,
  canvasWidth: number,
  canvasHeight: number,
  horizontalSpacingRatio = 0.15,
  verticalSpacingRatio = 0.5,
  layoutMode: "pyramid" | "wall" = "pyramid"
): Array<BrickPosition> {
  // Calculate unit dimensions in normalized space
  const unitWidth =
    1 / (maxLayerWidth + (maxLayerWidth - 1) * horizontalSpacingRatio)
  const unitHeight =
    1 / (totalLayers + (totalLayers - 1) * verticalSpacingRatio)

  // Calculate actual spacing in normalized units
  const horizontalSpacing = unitWidth * horizontalSpacingRatio
  const verticalSpacing = unitHeight * verticalSpacingRatio

  // Calculate starting X position based on layout mode
  let startXNormalized: number

  if (layoutMode === "pyramid") {
    // Centered (Pyramid) Layout
    startXNormalized =
      ((maxLayerWidth - elementsInLayer) / 2) * (unitWidth + horizontalSpacing)
  } else {
    // Right-Aligned (Wall) Layout
    startXNormalized =
      (maxLayerWidth - elementsInLayer) * (unitWidth + horizontalSpacing)
  }

  // Calculate Y position in normalized space
  // Note: In the spec, Y increases from bottom to top, but in SVG Y increases from top to bottom
  // So we invert the Y calculation
  const yNormalized =
    1 - (layerIndex * (unitHeight + verticalSpacing) + unitHeight)

  // Scale to actual canvas dimensions
  const brickWidth = unitWidth * canvasWidth
  const brickHeight = unitHeight * canvasHeight

  const positions: Array<BrickPosition> = []

  // Create positions for each brick in the layer
  for (let i = 0; i < elementsInLayer; i++) {
    const xNormalized = startXNormalized + i * (unitWidth + horizontalSpacing)

    positions.push({
      x: xNormalized * canvasWidth,
      y: yNormalized * canvasHeight,
      width: brickWidth,
      height: brickHeight,
    })
  }

  return positions
}

/**
 * Calculate the maximum number of elements across all layers
 */
export function calculateMaxLayerWidth(
  groupedData: Record<number, Array<unknown>>
): number {
  return Math.max(...Object.values(groupedData).map((items) => items.length))
}
