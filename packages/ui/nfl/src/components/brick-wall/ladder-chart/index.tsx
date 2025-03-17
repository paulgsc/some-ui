import type { RefObject } from "react"
import { useEffect, useRef, useState } from "react"
import { Brick } from "@nfl/components/brick-wall/brick"
import init, { process_chart_data } from "some-bricks"
import { cn, useMeasureRect } from "some-ui-utils"

type DataItem = {
  name: string
  value: number
}

type BrickPosition = {
  x: number
  y: number
  width: number
  height: number
}

type BrickData = {
  position: BrickPosition
  item: DataItem
  color_intensity: number
}

type CrownPosition = {
  x: number
  y: number
  width: number
  height: number
}

type ChartData = {
  bricks: Array<BrickData>
  crown_position: CrownPosition | null
  min_value: number
  max_value: number
}

type CrownProps = {
  position: CrownPosition
}

// Crown component for the winner
const Crown: React.FC<CrownProps> = ({ position }) => {
  const { x, y, width, height } = position

  return (
    <polygon
      points={`${x - width / 2},${y} ${x - width / 3},${y - height} ${x},${y - height / 2} ${x + width / 3},${y - height} ${x + width / 2},${y}`}
      fill="gold"
      stroke="#000"
      strokeWidth="1.5"
    />
  )
}

type BrickLadderChartProps = {
  data: Array<DataItem>
  className?: string
}

export const BrickLadderChart: React.FC<BrickLadderChartProps> = ({
  data,
  className,
}) => {
  const [wasmLoaded, setWasmLoaded] = useState(false)
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const { height, width } = useMeasureRect({
    ref: ref as RefObject<HTMLElement>,
  })

  const canvasWidth = width ?? 0
  const canvasHeight = height ?? 0
  const padding = Math.max(20, Math.min(50, canvasWidth * 0.05))

  // Initialize WASM module
  useEffect(() => {
    async function loadWasm() {
      try {
        await init()
        setWasmLoaded(true)
      } catch (error) {
        console.error("Failed to load WASM module:", error)
      }
    }

    loadWasm()
  }, [])

  // Process data with WASM when available
  useEffect(() => {
    if (wasmLoaded && data.length > 0) {
      try {
        const result = process_chart_data(
          data,
          canvasWidth,
          canvasHeight,
          padding
        )
        setChartData(result as ChartData)
      } catch (error) {
        console.error("Error processing chart data:", error)
      }
    }
  }, [wasmLoaded, data, canvasWidth, canvasHeight, padding])

  if (!wasmLoaded || !chartData) {
    return <div>Loading chart...</div>
  }

  return (
    <div ref={ref} className="size-full">
      <svg
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="currentColor"
        className={cn("size-full", className)}
      >
        {/* Render all bricks */}
        {chartData.bricks.map((brick, index) => (
          <Brick key={`brick-${index}`} brick={brick} />
        ))}

        {/* Render crown for the winner */}
        {chartData.crown_position && (
          <Crown position={chartData.crown_position} />
        )}
      </svg>
    </div>
  )
}
