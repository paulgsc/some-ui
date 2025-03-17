import type { BrickPosition } from "@nfl/types/brick-wall"

export function calculateBrickPositions(
  layerIndex: number,
  elementsInLayer: number,
  brickWidth: number,
  brickHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  padding: number
): Array<BrickPosition> {
  const positions = []

  // Calculate total width needed for this layer
  const totalLayerWidth = elementsInLayer * brickWidth

  // Starting X position (centered)
  let startX = (canvasWidth - totalLayerWidth) / 2

  // Apply the brick pattern offset for this layer
  // Each layer shifts by half brick width to create the staggered effect
  startX += (layerIndex * brickWidth) / 2

  // Calculate Y position (bottom up)
  const y = canvasHeight - padding - (layerIndex + 1) * brickHeight * 1.5

  // Generate positions for each brick in the layer
  for (let i = 0; i < elementsInLayer; i++) {
    positions.push({
      x: startX + i * brickWidth,
      y: y,
      width: brickWidth,
      height: brickHeight,
    })
  }

  return positions
}
