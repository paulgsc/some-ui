export { HangulHexGrid } from "./components"
export type { WordEntry, WordPedagogy } from "./data/hangul-words"

// Generic hex-grid renderer — canonical geometry only, no pedagogical or
// domain state (see the canon note in this package's README). Consumers
// outside this package own their own content model and interaction layer.
export { HexGrid } from "./components/hex-grid"
export type { HexGridProps } from "./components/hex-grid"
export type { HexCellData, HexPoint, HexRenderData } from "./types/hex-grid"
export { fitHexGrid, measureHexGridBounds } from "./utils/hex-grid-fit"
export type {
  HexGridFitRequest,
  HexGridFitResult,
  HexGridFitStrategy,
  ViewportSize,
} from "./utils/hex-grid-fit"
export {
  getCellCountForHexagonalGridRadius,
  getHexagonalGridRadiusForCellCount,
} from "./utils/hexagon-math"
