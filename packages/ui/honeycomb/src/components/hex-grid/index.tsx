import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { JSX, ReactNode } from "react"
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

const HEX_ID_REGEX = /(-?\d+)[_-](-?\d+)[_-](-?\d+)/

export const HexGrid = <T = unknown,>({
  className = "",
  cellCount,
  hexSize,
  viewBoxFactor = 1,
  cellContent = [],
  renderCell,
  backgroundOpacity = 0.15,
}: HexGridProps<T>): JSX.Element => {
  const [viewBox, setViewBox] = useState({
    viewBox: "0 0 0 0",
    transform: "",
  })

  // We use a ref to store the observer so it persists across renders
  const observerRef = useRef<ResizeObserver | null>(null)

  const { hexCells, isLoading, error } = useHexgridWasm({
    cellCount,
    hexSize,
  })

  const pointsToPath = useCallback((points: Array<HexPoint>): string => {
    const first = points[0]
    if (!first) return ""
    const rest = points.slice(1)
    return `M${first.x},${first.y} ${rest.map((p) => `L${p.x},${p.y}`).join(" ")} Z`
  }, [])

  // 2. Remount-safe Resize Observer using a Callback Ref
  const svgRef = useCallback(
    (node: SVGSVGElement | null): void => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }

      if (node) {
        observerRef.current = new ResizeObserver((entries) => {
          const entry = entries[0]
          if (entry) {
            const { width, height } = entry.contentRect
            const vb = `0 0 ${width * viewBoxFactor} ${height * viewBoxFactor}`
            const tr = `translate(${(width * viewBoxFactor) / 2}, ${(height * viewBoxFactor) / 2})`
            setViewBox({ viewBox: vb, transform: tr })
          }
        })
        observerRef.current.observe(node)
      }
    },
    [viewBoxFactor]
  )

  // Cleanup observer on component unmount
  useEffect(() => {
    return (): void => observerRef.current?.disconnect()
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
      </defs>

      <g transform={viewBox.transform}>
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

          const centerX = cell.points.reduce((s, p) => s + p.x, 0) / numPoints
          const centerY = cell.points.reduce((s, p) => s + p.y, 0) / numPoints
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
  )
}
