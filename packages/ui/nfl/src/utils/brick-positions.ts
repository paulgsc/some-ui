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

  const totalLayerWidth = elementsInLayer * brickWidth

  let startX = (canvasWidth - totalLayerWidth) / 2

  startX += (layerIndex * brickWidth) / 2

  const y = canvasHeight - padding - (layerIndex + 1) * brickHeight * 1.5

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
