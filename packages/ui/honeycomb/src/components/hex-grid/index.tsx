import { useCallback, useEffect, useMemo, useRef } from "react"
import type { JSX, ReactNode } from "react"
import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import type {
  HexCellData,
  HexPoint,
  HexRenderData,
} from "@honeycomb/types/hex-grid"
import type {
  HexGridFitResult,
  HexGridFitStrategy,
  ViewportSize,
} from "@honeycomb/utils/hex-grid-fit"
import { fitHexGrid } from "@honeycomb/utils/hex-grid-fit"
import {
  getCellCountForHexagonalGridRadius,
  getHexagonalGridRadiusForCellCount,
} from "@honeycomb/utils/hexagon-math"
import { useResizeObserver } from "some-ui-utils"
import { toast } from "sonner"

export type HexGridProps<T = unknown> = {
  cellCount: number
  hexSize: number
  viewBoxFactor?: number
  className?: string
  cellContent?: Array<{
    id: string
    content: HexCellData<T>
  }>
  renderCell?: (
    cell: HexRenderData<T>,
    centerX: number,
    centerY: number,
    cellWidth: number,
    hexPath: string
  ) => ReactNode
  backgroundOpacity?: number
  /**
   * Smallest on-screen hex circumradius (px) still considered legible.
   * @default 18
   */
  minHexSize?: number
  /** Space to reserve on every edge before fitting, in px. @default 16 */
  padding?: number
  /**
   * How to react when the requested grid no longer fits. See
   * `HexGridFitStrategy` for the tradeoffs — defaults to `"shrink-only"`
   * because cell ids can carry meaning beyond rendering (e.g. game state
   * keyed by cell id), and reducing the radius makes outer-ring cells
   * disappear entirely.
   * @default "shrink-only"
   */
  fitStrategy?: HexGridFitStrategy
  /** Called whenever the layout negotiation result changes. */
  onFitChange?: (fit: HexGridFitResult) => void
}

const HEX_ID_REGEX = /(-?\d+)[_-](-?\d+)[_-](-?\d+)/

const HEXGRID_FIT_TOAST_ID = "hexgrid-fit-status"

const ImpossibleNotice = ({
  bounds,
}: {
  bounds: ViewportSize
}): JSX.Element => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center text-red-300">
    <span className="text-sm font-semibold">Viewport too small</span>
    <span className="text-xs text-red-300/80">
      Minimum required: {Math.ceil(bounds.width)}×{Math.ceil(bounds.height)}px
    </span>
  </div>
)

export const HexGrid = <T = unknown,>({
  className = "",
  cellCount,
  hexSize,
  viewBoxFactor = 1,
  cellContent = [],
  renderCell,
  backgroundOpacity = 0.15,
  minHexSize = 18,
  padding = 16,
  fitStrategy = "shrink-only",
  onFitChange,
}: HexGridProps<T>): JSX.Element => {
  const measureRef = useRef<HTMLDivElement>(null)
  const { width, height } = useResizeObserver({ ref: measureRef })
  const hasMeasured = width !== undefined && height !== undefined

  const requestedRadius = useMemo(
    () => getHexagonalGridRadiusForCellCount(cellCount),
    [cellCount]
  )

  const fit = useMemo((): HexGridFitResult | null => {
    if (!hasMeasured) return null
    return fitHexGrid({
      viewport: { width, height },
      requestedRadius,
      preferredHexSize: hexSize,
      minHexSize,
      padding,
      strategy: fitStrategy,
    })
  }, [
    hasMeasured,
    width,
    height,
    requestedRadius,
    hexSize,
    minHexSize,
    padding,
    fitStrategy,
  ])

  useEffect(() => {
    if (!fit) return
    onFitChange?.(fit)

    if (fit.status === "shrunk" || fit.status === "reduced-radius") {
      const notify =
        fit.status === "reduced-radius" ? toast.warning : toast.info
      notify(fit.warning, { id: HEXGRID_FIT_TOAST_ID })
    } else {
      toast.dismiss(HEXGRID_FIT_TOAST_ID)
    }
  }, [fit, onFitChange])

  const effectiveRadius = fit?.radius ?? requestedRadius
  const effectiveHexSize = fit?.hexSize ?? hexSize
  const effectiveCellCount = useMemo(
    () => getCellCountForHexagonalGridRadius(effectiveRadius),
    [effectiveRadius]
  )

  const { hexCells, isLoading, error } = useHexgridWasm({
    cellCount: effectiveCellCount,
    hexSize: effectiveHexSize,
  })

  const pointsToPath = useCallback((points: Array<HexPoint>): string => {
    const first = points[0]
    if (!first) return ""
    const rest = points.slice(1)
    return `M${first.x},${first.y} ${rest.map((p) => `L${p.x},${p.y}`).join(" ")} Z`
  }, [])

  const contentMap = useMemo((): Map<string, HexCellData<T>> => {
    const map = new Map<string, HexCellData<T>>()
    cellContent.forEach(({ id, content }) => {
      map.set(id, content)
      const m = id.match(HEX_ID_REGEX)
      if (m?.[1] && m[2] && m[3]) {
        const q = m[1]
        const r = m[2]
        const s = m[3]
        map.set(`hex_${q}_${r}_${s}`, content)
        map.set(`${q}-${r}-${s}`, content)
      }
    })
    return map
  }, [cellContent])

  const mergedCells: Array<HexRenderData<T>> = useMemo(
    (): Array<HexRenderData<T>> =>
      hexCells.map((wasmCell) => ({
        ...wasmCell,
        content: contentMap.get(wasmCell.id),
      })),
    [hexCells, contentMap]
  )

  const renderContent = (): ReactNode => {
    if (!hasMeasured || isLoading) {
      return (
        <div className="flex h-full w-full items-center justify-center text-gray-400">
          Loading hexagon grid...
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex h-full w-full items-center justify-center text-red-400">
          Error: {error}
        </div>
      )
    }

    if (!fit || fit.status === "impossible") {
      return (
        <ImpossibleNotice bounds={fit?.bounds ?? { width: 0, height: 0 }} />
      )
    }

    const vbWidth = fit.bounds.width * viewBoxFactor
    const vbHeight = fit.bounds.height * viewBoxFactor
    const viewBox = `${-vbWidth / 2} ${-vbHeight / 2} ${vbWidth} ${vbHeight}`

    return (
      <div className="flex size-full items-center justify-center">
        <div
          className="size-full"
          style={{ maxWidth: vbWidth, maxHeight: vbHeight }}
        >
          <svg
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            className={`size-full ${className}`}
          >
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g>
              {/* Background grid */}
              <g opacity={backgroundOpacity}>
                {hexCells.map((cell) => (
                  <path
                    key={`bg-${cell.id}`}
                    d={pointsToPath(cell.points)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-gray-950"
                  />
                ))}
              </g>

              {/* Active/themed cells */}
              {mergedCells.map((cell) => {
                const { content } = cell
                if (!content?.theme && !content?.data) return null

                const { theme } = content
                const numPoints = cell.points.length
                if (numPoints === 0) return null

                const centerX =
                  cell.points.reduce((s, p) => s + p.x, 0) / numPoints
                const centerY =
                  cell.points.reduce((s, p) => s + p.y, 0) / numPoints
                const xValues = cell.points.map((p) => p.x)
                const cellWidth = Math.max(...xValues) - Math.min(...xValues)
                const pathData = pointsToPath(cell.points)

                return (
                  <g key={cell.id}>
                    <path
                      d={pathData}
                      fill={
                        theme.fill ||
                        (cell.color
                          ? `#${cell.color.toString(16).padStart(6, "0")}`
                          : "none")
                      }
                      stroke={theme.stroke || "#999"}
                      strokeWidth={theme.strokeWidth || 1}
                      opacity={theme.opacity ?? 1}
                      filter={theme.filter}
                    />
                    {renderCell?.(cell, centerX, centerY, cellWidth, pathData)}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      </div>
    )
  }

  return (
    <div ref={measureRef} className="relative size-full">
      {renderContent()}
    </div>
  )
}
