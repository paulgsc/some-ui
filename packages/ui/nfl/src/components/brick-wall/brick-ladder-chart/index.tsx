import type { FC, ReactNode, RefObject } from "react"
import { useRef } from "react"
import { Brick } from "@nfl/components/brick-wall/brick"
import { Crown } from "@nfl/components/brick-wall/crown"
import { Medal } from "@nfl/components/brick-wall/medal"
import { calculateBrickPositions } from "@nfl/utils/brick-positions"
import { cn, useMeasureRect } from "some-ui-utils"

type DataItem = {
  name: string
  value: number
}

type BrickLadderChartProps = {
  data: Array<DataItem>
  className?: string
}

export const BrickLadderChart: FC<BrickLadderChartProps> = ({
  data,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { height, width } = useMeasureRect({
    ref: containerRef as RefObject<HTMLElement>,
  })

  const canvasWidth = width ?? 0
  const canvasHeight = height ?? 0

  const padding = Math.max(20, Math.min(50, canvasWidth * 0.05)) // Responsive padding

  // Process data - sort by value (ascending)
  const processedData = [...data].sort((a, b) => a.value - b.value)
  const minValue = Math.min(...processedData.map((d) => d.value))
  const maxValue = Math.max(...processedData.map((d) => d.value))

  // Group data by value
  const groupedData: Record<number, Array<DataItem>> = {}
  processedData.forEach((item) => {
    if (!groupedData[item.value]) {
      groupedData[item.value] = []
    }
    groupedData[item.value].push(item)
  })

  // Get unique values and sort them (ascending)
  const uniqueValues = Object.keys(groupedData)
    .map(Number)
    .sort((a, b) => a - b)

  // Calculate layer sizes (number of bricks per layer)
  // Start with 1 at the top, increase by 1 for each layer down
  const layerSizes: Array<number> = []
  for (let i = 0; i < uniqueValues.length; i++) {
    // Top layer (highest value) has 1 brick, each layer below adds 1 more
    layerSizes.unshift(i + 1)
  }

  // Set brick width based on canvas size and max elements in a layer
  const maxElementsInLayer = Math.max(...layerSizes)
  const brickWidth = Math.min(
    canvasWidth * 0.2, // Max 20% of canvas width
    (canvasWidth - padding * 2) / (maxElementsInLayer + 0.5)
  )

  // Adjust brick height proportionally
  const brickHeight = brickWidth * 0.4

  // Generate bricks for all layers
  const renderBricks = (): Array<ReactNode> | ReactNode => {
    if (canvasWidth === 0 || canvasHeight === 0) return null

    const allBricks = []

    // Iterate through layers from bottom to top
    for (let layerIndex = 0; layerIndex < layerSizes.length; layerIndex++) {
      const elementsInLayer = layerSizes[layerIndex]
      const valueForLayer = uniqueValues[layerIndex]
      const itemsForLayer = groupedData[valueForLayer] || []

      // Calculate brick positions for this layer
      const positions = calculateBrickPositions(
        layerIndex,
        elementsInLayer,
        brickWidth,
        brickHeight,
        canvasWidth,
        canvasHeight,
        padding
      )

      // Generate bricks for this layer
      for (let posIndex = 0; posIndex < positions.length; posIndex++) {
        const pos = positions[posIndex]

        if (posIndex < itemsForLayer.length) {
          // Real data brick
          const item = itemsForLayer[posIndex]
          const brick = {
            position: {
              x: pos.x,
              y: pos.y,
              width: brickWidth,
              height: brickHeight,
            },
            item,
            maxValue,
            minValue,
          }

          allBricks.push(<Brick key={`brick-${layerIndex}`} brick={brick} />)
        } else {
          // Blank placeholder brick
          const brick = {
            position: {
              x: pos.x,
              y: pos.y,
              width: brickWidth,
              height: brickHeight,
            },
            maxValue,
            minValue,
            isBlank: true,
          }

          allBricks.push(<Brick key={`brick-${layerIndex}`} brick={brick} />)
        }
      }
    }

    return allBricks
  }

  const renderCrown = (): Array<ReactNode> | ReactNode => {
    if (uniqueValues.length === 0 || canvasWidth === 0 || canvasHeight === 0)
      return null

    // Get the top layer (highest value)
    const topLayer = layerSizes.length - 1

    // Get positions for the top layer
    const topPositions = calculateBrickPositions(
      topLayer,
      layerSizes[topLayer],
      brickWidth,
      brickHeight,
      canvasWidth,
      canvasHeight,
      padding
    )

    // Place crown above the first brick in the top layer (which should be the highest value)
    if (topPositions.length > 0) {
      const topPos = topPositions[0]
      const crownX = topPos.x + brickWidth / 2
      const crownY = topPos.y
      const crownWidth = brickWidth * 0.6
      const crownHeight = brickHeight * 0.5

      return (
        <Crown x={crownX} y={crownY} width={crownWidth} height={crownHeight} />
      )
    }

    return null
  }

  // Render medals for the top three layers
  const renderMedals = () => {
    if (layerSizes.length < 3 || canvasWidth === 0 || canvasHeight === 0)
      return null

    const medals = []
    const medalSize = brickWidth * 0.8

    // Get positions for the top three layers
    const topLayers = [
      layerSizes.length - 1, // Gold (top layer)
      layerSizes.length - 2, // Silver (second layer)
      layerSizes.length - 3, // Bronze (third layer)
    ]

    // Calculate medal positions
    for (let i = 0; i < 3; i++) {
      const layerIndex = topLayers[i]
      const positions = calculateBrickPositions(
        layerIndex,
        layerSizes[layerIndex],
        brickWidth,
        brickHeight,
        canvasWidth,
        canvasHeight,
        padding
      )

      if (positions.length > 0) {
        // Position medal above the first brick in each layer
        const pos = positions[0]
        const medalX = pos.x + brickWidth / 2

        // Calculate ribbon height to reach from top to the brick
        const ribbonHeight = pos.y - medalSize / 2

        // Add medal
        medals.push(
          <Medal
            key={`medal-${i}`}
            x={medalX}
            y={pos.y - medalSize / 2}
            size={medalSize}
            type={i === 0 ? "gold" : i === 1 ? "silver" : "bronze"}
            ribbonHeight={ribbonHeight}
          />
        )
      }
    }

    return medals
  }

  // Calculate title font size based on canvas width
  const titleFontSize = Math.max(12, Math.min(20, canvasWidth * 0.025))

  return (
    <div ref={containerRef} className="size-full">
      <svg
        className={cn("size-full", className)}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Title */}
        <text
          x={canvasWidth / 2}
          y={padding / 2}
          textAnchor="middle"
          fontFamily="Arial"
          fontWeight="bold"
          fontSize={titleFontSize}
        >
          Data Visualization Brick Ladder
        </text>

        {/* Base platform */}
        <rect
          x={padding}
          y={canvasHeight - padding}
          width={canvasWidth - padding * 2}
          height={Math.max(5, canvasHeight * 0.01)}
          fill="#555"
          stroke="#000"
          strokeWidth="2"
        />

        {/* Render medals */}
        {renderMedals()}
        {/* Render all bricks */}
        {renderBricks()}

        {/* Render crown for the winner */}
        {renderCrown()}
      </svg>
    </div>
  )
}
