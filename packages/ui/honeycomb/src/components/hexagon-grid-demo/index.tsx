import { useRef } from "react"
import type { FC, MouseEvent } from "react"
import { useNflRoster } from "@honeycomb/data/nfl-roster"
import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import { Button, NFLJersey } from "some-ui-shared"

type HexPoint = {
  x: number
  y: number
}

type HexRenderData = {
  id: string
  points: Array<HexPoint>
  color: number | null
  content: string | null
}

type HexGridProps = {
  cellCount: number
  hexSize: number
  width?: number
  height?: number
  onCellClick?: (x: number, y: number, z: number) => void
}

export const DemoGrid: FC<HexGridProps> = ({
  cellCount,
  hexSize,
  width = 800,
  height = 600,
  onCellClick,
}) => {
  const { data: response, error: fetchError } = useNflRoster({})
  const svgRef = useRef<SVGSVGElement>(null)
  const { hexCells, isLoading, error, hexGridRef, setHexCells } =
    useHexgridWasm({
      cellCount,
      hexSize,
    })

  // Create a sample pattern
  const createPattern = (patternType: string) => {
    if (!hexGridRef.current) return
    if (!response) return

    hexGridRef.current.clear_all()

    switch (patternType) {
      case "overlapping":
        const size = hexGridRef.current.radius()
        hexGridRef.current.place_text("BROCK", -size, 1, 0xe74c3c)
        break
      case "foo": {
        type HexData = {
          color: number // RGB as 0xRRGGBB
          weight: number
          label: string
          value: string
        }

        const data: Array<HexData> = response.reduce((acc, curr) => {
          const { weight, color, label, id } = curr
          const next: HexData = {
            color,
            weight,
            label,
            value: `${id}`,
          }
          return [...acc, next]
        }, [])

        hexGridRef.current.set_layout_manager(0, "CENTER", 0xffff00)
        hexGridRef.current.layout_symmetric_data(data)
        break
      }
      default:
        break
    }

    try {
      const renderData: Array<HexRenderData> =
        hexGridRef.current.get_all_cells_render_data()
      setHexCells(renderData)
    } catch (err) {
      console.error("Failed to get render data:", err)
    }
  }

  // Generate SVG path string from points
  const pointsToPath = (points: Array<HexPoint>): string => {
    if (!points || points.length === 0) return ""

    return `M${points[0].x},${points[0].y} ${points
      .slice(1)
      .map((p) => `L${p.x},${p.y}`)
      .join(" ")} Z`
  }

  if (isLoading) {
    return <div>Loading hexagon grid...</div>
  }

  if (error) {
    return <div>Error: {error}</div>
  }

  // Calculate SVG viewBox
  const viewBox = `0 0 ${width} ${height}`

  // SVG transform to center the grid
  const transform = `translate(${width / 2}, ${height / 2})`

  if (fetchError || !response || response.length === 0)
    return <div> {`error fetching ${fetchError}`}</div>

  return (
    <div>
      <div className="z-50">
        <Button
          className="cursor-pointer"
          onClick={() => createPattern("overlapping")}
        >
          Overlapping Pattern
        </Button>
        <Button className="cursor-pointer" onClick={() => createPattern("foo")}>
          foofooo
        </Button>

        <Button
          className="cursor-pointer"
          onClick={() => {
            hexGridRef.current?.clear_all()
          }}
        >
          Clear
        </Button>
      </div>

      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="z-0 size-full border border-red-500"
      >
        <g transform={transform}>
          {hexCells.map((cell, i) => {
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
            const cellHeight =
              Math.max(...cell.points.map((p) => p.y)) -
              Math.min(...cell.points.map((p) => p.y))

            // Scale jersey to fit in the cell (using 70% of cell width)
            const scale = (cellWidth * 0.7) / 300 // 300 is the original jersey width
            const { jerseyNumber, name } = response[i % response.length]

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
                {cell.content && (
                  <>
                    <NFLJersey
                      centerX={centerX}
                      centerY={centerY}
                      scale={scale}
                      name={name}
                      number={jerseyNumber}
                    />
                  </>
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
