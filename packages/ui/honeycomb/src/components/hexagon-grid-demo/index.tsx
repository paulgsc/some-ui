import { useRef } from "react"
import type { FC, MouseEvent } from "react"
import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"
import { Button } from "some-ui-shared"

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
  const svgRef = useRef<SVGSVGElement>(null)
  const { hexCells, isLoading, error, hexGridRef, setHexCells } =
    useHexgridWasm({
      cellCount,
      hexSize,
    })

  // Handle cell click
  const handleCellClick = (event: MouseEvent<SVGElement>) => {
    if (!grid || !svgRef.current || !onCellClick) return

    // Get click coordinates relative to SVG
    const svgRect = svgRef.current.getBoundingClientRect()
    const x = event.clientX - svgRect.left
    const y = event.clientY - svgRect.top

    try {
      // Convert pixel coordinates to hex coordinates
      const hexCoordJson = grid.pixel_to_hex(x, y)
      const [cubeX, cubeY, cubeZ] = hexCoordJson

      // Call the callback with the cube coordinates
      onCellClick(cubeX, cubeY, cubeZ)
    } catch (err) {
      console.error("Error converting pixel to hex coordinates:", err)
    }
  }

  // Create a sample pattern
  const createPattern = (patternType: string) => {
    if (!hexGridRef.current) return

    hexGridRef.current.clear_all()

    switch (patternType) {
      case "overlapping":
        hexGridRef.current.render_text("CONGRATS BROCK!", 0, 0, 0, 3, 0xe74c3c)
        break
      case "corner-touching":
        hexGridRef.current.create_corner_touching_pattern(2, 0xe74c3c)
        break
      case "hexagon":
        hexGridRef.current.create_hexagon_pattern(2, 4, 0x2ecc71)
        break
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

  return (
    <div>
      <div className="z-50">
        <Button
          className="cursor-pointer"
          onClick={() => createPattern("overlapping")}
        >
          Overlapping Pattern
        </Button>
        <Button
          className="cursor-pointer"
          onClick={() => createPattern("corner-touching")}
        >
          Corner-Touching Pattern
        </Button>
        <Button
          className="cursor-pointer"
          onClick={() => createPattern("hexagon")}
        >
          Hexagon Pattern
        </Button>
        <Button
          className="cursor-pointer"
          onClick={() => grid?.clear_all() && setHexCells([])}
        >
          Clear
        </Button>
      </div>

      <svg
        ref={svgRef}
        viewBox={viewBox}
        onClick={handleCellClick}
        className="z-0 size-full border border-red-500"
      >
        <g transform={transform}>
          {hexCells.map((cell) => (
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
              )}
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
