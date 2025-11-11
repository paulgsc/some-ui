import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import type { HexPoint, HexRenderData } from "@honeycomb/types/hex-grid"

// Extended type for theming/content
export type HexCellTheme = {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  filter?: string
}

export type HexCellData<T = any> = {
  id: string
  data?: T
  theme?: HexCellTheme
}

type HexGridProps<T = any> = {
  cellCount: number
  hexSize: number
  viewBoxFactor?: number
  className?: string
  cells?: HexCellData<T>[]
  renderCell?: (
    cell: HexRenderData & HexCellData<T>,
    centerX: number,
    centerY: number,
    cellWidth: number
  ) => ReactNode
  backgroundOpacity?: number
}

export function HexGrid<T = any>({
  className = "",
  cellCount,
  hexSize,
  viewBoxFactor = 1,
  cells = [],
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

  const pointsToPath = useCallback((points: HexPoint[]): string => {
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

    return () => {
      if (contentTimerRef.current) clearTimeout(contentTimerRef.current)
    }
  }, [getViewBox])

  // Create a map of cell data by ID for quick lookup
  // Support multiple ID formats: "hex_-2_0_2", "-2-0-2", or normalized "q-r-s"
  const cellDataMap = new Map<string, HexCellData<T>>()

  cells.forEach((cell) => {
    cellDataMap.set(cell.id, cell)

    // Also index by normalized coordinate format
    // Extract q, r, s from various formats
    const coordMatch = cell.id.match(/(-?\d+)[_-](-?\d+)[_-](-?\d+)/)
    if (coordMatch) {
      const [, q, r, s] = coordMatch
      // Store with multiple key formats for flexible matching
      cellDataMap.set(`hex_${q}_${r}_${s}`, cell)
      cellDataMap.set(`${q}-${r}-${s}`, cell)
    }
  })

  // Merge WASM cells with provided cell data/theme
  const mergedCells = hexCells.map((wasmCell) => {
    const cellData = cellDataMap.get(wasmCell.id)
    return cellData ? { ...wasmCell, ...cellData } : wasmCell
  })

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
      className={`absolute inset-0 size-full ${className}`}
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
              strokeWidth="0.5"
              className="text-gray-600"
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

          const theme = cell.theme

          // Only render themed cells (cells with theme or data)
          if (!theme && !cell.data) return null

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
              {renderCell && renderCell(cell, centerX, centerY, cellWidth)}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
