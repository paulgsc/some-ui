import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import type {
  HexCellData,
  HexPoint,
  HexRenderData,
} from "@honeycomb/types/hex-grid"

type HexGridProps<T = unknown> = {
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
}

export function HexGrid<T = any>({
  className = "",
  cellCount,
  hexSize,
  viewBoxFactor = 1,
  cellContent = [],
  renderCell,
  backgroundOpacity = 0.15,
}: HexGridProps<T>) {
  const [viewBox, setViewBox] = useState<
    Record<"viewBox" | "transform", string>
  >({
    viewBox: "0 0 0 0",
    transform: "",
  })
  const svgRef = useRef<SVGSVGElement>(null)
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Use the WASM hook internally - this is what defines the hexagon structure
  const { hexCells, isLoading, error } = useHexgridWasm({
    cellCount,
    hexSize,
  })

  const pointsToPath = useCallback((points: Array<HexPoint>): string => {
    return `M${points[0].x},${points[0].y} ${points
      .slice(1)
      .map((p) => `L${p.x},${p.y}`)
      .join(" ")} Z`
  }, [])

  const getViewBox = useCallback(
    (width: number, height: number) => {
      const viewBox = `0 0 ${width * viewBoxFactor} ${height * viewBoxFactor}`
      const transform = `translate(${(width * viewBoxFactor) / 2}, ${(height * viewBoxFactor) / 2})`
      setViewBox((prev) => ({ ...prev, transform, viewBox }))
    },
    [viewBoxFactor]
  )

  useEffect(() => {
    contentTimerRef.current = setTimeout(() => {
      const domRect = svgRef.current?.getBoundingClientRect()
      if (domRect) {
        getViewBox(domRect.width, domRect.height)
      }
    }, 50)

    return (): void => {
      if (contentTimerRef.current) clearTimeout(contentTimerRef.current)
    }
  }, [getViewBox])

  const contentMap = useMemo(() => {
    const map = new Map<string, HexCellData<T>>()
    cellContent.forEach(({ id, content }) => {
      map.set(id, content)
      const m = id.match(/(-?\d+)[_-](-?\d+)[_-](-?\d+)/)
      if (m) {
        const [, q, r, s] = m
        map.set(`hex_${q}_${r}_${s}`, content)
        map.set(`${q}-${r}-${s}`, content)
      }
    })
    return map
  }, [cellContent])

  const mergedCells: Array<HexRenderData<T>> = hexCells.map((wasmCell) => ({
    ...wasmCell,
    content: contentMap.get(wasmCell.id),
  }))

  if (isLoading) {
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

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox.viewBox}
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

        <filter id="strong-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="8" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform={viewBox.transform}>
        {/* Background grid - show all WASM cells */}
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
          const centerX =
            cell.points.reduce((sum, point) => sum + point.x, 0) /
            cell.points.length
          const centerY =
            cell.points.reduce((sum, point) => sum + point.y, 0) /
            cell.points.length

          const cellWidth =
            Math.max(...cell.points.map((p) => p.x)) -
            Math.min(...cell.points.map((p) => p.x))

          const { content: { theme, data } = {} } = cell

          // Only render themed cells (cells with theme or data)
          if (!theme && !data) return null

          return (
            <g key={cell.id}>
              <path
                d={pointsToPath(cell.points)}
                fill={
                  theme?.fill ||
                  (cell.color
                    ? `#${cell.color.toString(16).padStart(6, "0")}`
                    : "none")
                }
                stroke={theme?.stroke || "#999"}
                strokeWidth={theme?.strokeWidth || 1}
                opacity={theme?.opacity ?? 1}
                filter={theme?.filter}
              />
              {renderCell &&
                renderCell(
                  cell,
                  centerX,
                  centerY,
                  cellWidth,
                  pointsToPath(cell.points)
                )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
