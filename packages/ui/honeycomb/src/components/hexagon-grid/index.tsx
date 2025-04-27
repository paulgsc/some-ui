import { useRef } from "react"
import { useHexgridWasm } from "@honeycomb/hooks/use-hexgrid-wasm"

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
  radius: number
  hexSize: number
  width?: number
  height?: number
  onCellClick?: (x: number, y: number, z: number) => void
}

export const HexGrid: React.FC<HexGridProps> = ({
  radius,
  hexSize,
  width = 800,
  height = 600,
  onCellClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const { hexCells, isLoading, error } = useHexgridWasm(radius, hexSize)

  // Handle cell click
  const handleCellClick = (event: React.MouseEvent<SVGElement>) => {
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
    if (!grid) return

    grid.clear_all()

    switch (patternType) {
      case "overlapping":
        grid.create_overlapping_pattern(2, 3, 0x3498db)
        break
      case "corner-touching":
        grid.create_corner_touching_pattern(2, 0xe74c3c)
        break
      case "hexagon":
        grid.create_hexagon_pattern(2, 4, 0x2ecc71)
        break
      default:
        break
    }

    // Update the render data
    try {
      const renderDataJson = grid.get_all_cells_render_data()
      const renderData: Array<HexRenderData> = renderDataJson
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
      <div className="controls">
        <button
          className="cursor-pointer bg-blue-100"
          onClick={() => createPattern("overlapping")}
        >
          Overlapping Pattern
        </button>
        <button onClick={() => createPattern("corner-touching")}>
          Corner-Touching Pattern
        </button>
        <button onClick={() => createPattern("hexagon")}>
          Hexagon Pattern
        </button>
        <button onClick={() => grid?.clear_all() && setHexCells([])}>
          Clear
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={viewBox}
        onClick={handleCellClick}
        className="size-full border border-red-500"
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
