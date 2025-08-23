import { useCallback, useEffect, useRef, useState } from "react"
import type { FC } from "react"
import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import type { HexPoint } from "@honeycomb/types/hex-grid"
import { NFLJersey } from "some-ui-shared"
import { cn } from "some-ui-utils"

type HexGridProps = {
  cellCount: number
  hexSize: number
  viewBoxFactor?: number // TODO: look into the math to better set the viewbox dimensions
  className?: string
}

export const HexGrid: FC<HexGridProps> = ({
  className,
  cellCount,
  hexSize,
  viewBoxFactor = 1,
}) => {
  const [viewBox, setViewBox] = useState<
    Record<"viewBox" | "transform", string>
  >({ viewBox: "0 0 0 0", transform: "" })
  const svgRef = useRef<SVGSVGElement>(null)
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  if (isLoading) {
    return <div>Loading hexagon grid...</div>
  }

  if (error) {
    return <div>Error: {error}</div>
  }

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox.viewBox}
      className={cn("absolute inset-0 size-full", className)}
    >
      <g transform={viewBox.transform}>
        {hexCells.map((cell) => {
          const centerX =
            cell.points.reduce((sum, point) => sum + point.x, 0) /
            cell.points.length
          const centerY =
            cell.points.reduce((sum, point) => sum + point.y, 0) /
            cell.points.length

          // Calculate cell size (approximate width of the hex)
          const cellWidth =
            Math.max(...cell.points.map((p) => p.x)) -
            Math.min(...cell.points.map((p) => p.x))
          // const cellHeight =
          //   Math.max(...cell.points.map((p) => p.y)) -
          //   Math.min(...cell.points.map((p) => p.y))

          // Scale jersey to fit in the cell (using 70% of cell width)
          const scale = (cellWidth * 0.7) / 300 // 300 is the original jersey width

          return (
            <g key={cell.id}>
              <path
                d={pointsToPath(cell.points)}
                fill={
                  cell.color
                    ? `#${cell.color.toString(16).padStart(6, "0")}`
                    : "none"
                }
                stroke="#999"
                strokeWidth="1"
              />
              {/* How should we set the content? Should it be in the api or the client? */}
              {cell.content && (
                <>
                  <NFLJersey
                    number={"13"}
                    name={"pgdev"}
                    centerX={centerX}
                    centerY={centerY}
                    scale={scale}
                  />
                  <text
                    x={
                      cell.points.reduce((sum, point) => sum + point.x, 0) /
                      cell.points.length
                    }
                    y={
                      cell.points.reduce((sum, point) => sum + point.y, 0) /
                      cell.points.length
                    }
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="10"
                  >
                    {cell.content}
                  </text>
                </>
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
