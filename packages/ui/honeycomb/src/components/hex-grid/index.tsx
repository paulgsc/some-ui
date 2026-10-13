import { useCallback, useEffect, useMemo, useRef } from "react"
import type { JSX, ReactNode } from "react"
import type { HexGridGeometry } from "@honeycomb/hooks/use-hexgrid-wasm"
import type {
  HexCellData,
  HexPoint,
  HexRenderData,
} from "@honeycomb/types/hex-grid"
import type {
  HexGridFitResult,
  ViewportSize,
} from "@honeycomb/utils/hex-grid-fit"
import { fitHexGrid } from "@honeycomb/utils/hex-grid-fit"
import { useResizeObserver } from "@some-ui/react-hooks"
import { toast } from "sonner"

export type HexGridProps<T = unknown> = {
  /**
   * The cells to draw, from the caller's `useHexgridWasm`, so a caller that
   * must stop on a failed load (a game loop, audio, timers) reads `error`
   * where it already holds it.
   */
  grid: HexGridGeometry
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
   * Whether a shrunk or reduced fit announces itself with a toast. Leave it on
   * for a board whose cells a player has to read at a size they chose; turn it
   * off for a surface that is *meant* to scale to its box, where shrinking to
   * fit is the design rather than a degradation worth interrupting for.
   * @default true
   */
  notifyFit?: boolean
  /**
   * What occupies the grid's box while the geometry WASM loads. Defaults to a
   * short loading line; pass `null` for a surface that must not show prose it
   * did not ask for.
   */
  fallback?: ReactNode
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
  grid,
  viewBoxFactor = 1,
  cellContent = [],
  renderCell,
  backgroundOpacity = 0.15,
  minHexSize = 18,
  padding = 16,
  notifyFit = true,
  fallback = (
    <div className="flex h-full w-full items-center justify-center text-gray-400">
      Loading hexagon grid...
    </div>
  ),
}: HexGridProps<T>): JSX.Element => {
  const measureRef = useRef<HTMLDivElement>(null)
  const { width, height } = useResizeObserver({ ref: measureRef })
  const hasMeasured = width !== undefined && height !== undefined

  const { radius, hexSize, hexCells, isLoading, error } = grid

  const fit = useMemo((): HexGridFitResult | null => {
    if (!hasMeasured) return null
    return fitHexGrid({
      viewport: { width, height },
      requestedRadius: radius,
      preferredHexSize: hexSize,
      minHexSize,
      padding,
    })
  }, [hasMeasured, width, height, radius, hexSize, minHexSize, padding])

  // The toast is outside React; this keeps it in step with the fit.
  useEffect(() => {
    if (!fit || !notifyFit) return

    if (fit.status === "shrunk") {
      toast.info(fit.warning, { id: HEXGRID_FIT_TOAST_ID })
    } else {
      toast.dismiss(HEXGRID_FIT_TOAST_ID)
    }
  }, [fit, notifyFit])

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
      return fallback
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
                      className={theme.className}
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
