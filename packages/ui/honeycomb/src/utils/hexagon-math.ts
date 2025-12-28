export function getHexagonalGridRadiusForCellCount(
  targetCellCount: number
): number {
  if (targetCellCount <= 0) {
    return 0
  }

  const approximateRadius = Math.sqrt((targetCellCount - 1) / 3)

  const floorRadius = Math.floor(approximateRadius)
  const ceilRadius = Math.ceil(approximateRadius)

  const cellsForFloor = 3 * floorRadius * floorRadius + 3 * floorRadius + 1
  const cellsForCeil = 3 * ceilRadius * ceilRadius + 3 * ceilRadius + 1

  if (
    Math.abs(cellsForFloor - targetCellCount) <=
    Math.abs(cellsForCeil - targetCellCount)
  ) {
    return floorRadius
  }
  return ceilRadius
}

export function getCellCountForHexagonalGridRadius(radius: number): number {
  return 3 * radius * radius + 3 * radius + 1
}
