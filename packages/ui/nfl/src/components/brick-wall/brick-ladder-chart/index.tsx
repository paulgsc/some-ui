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
  title?: string
  className?: string
}

export const BrickLadderChart: FC<BrickLadderChartProps> = ({
  data,
  title = "Some title...",
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { height, width } = useMeasureRect({
    ref: containerRef as RefObject<HTMLElement>,
  })

  const canvasWidth = width ?? 0
  const canvasHeight = height ?? 0

  const padding = Math.max(20, Math.min(50, canvasWidth * 0.05)) // Responsive padding

  const processedData = [...data].sort((a, b) => a.value - b.value)
  const minValue = Math.min(...processedData.map((d) => d.value))
  const maxValue = Math.max(...processedData.map((d) => d.value))

  const groupedData: Record<number, Array<DataItem>> = {}
  processedData.forEach((item) => {
    if (!groupedData[item.value]) {
      groupedData[item.value] = []
    }
    groupedData[item.value].push(item)
  })

  const uniqueValues = Object.keys(groupedData)
    .map(Number)
    .sort((a, b) => a - b)

  const layerSizes: Array<number> = []
  for (let i = 0; i < uniqueValues.length; i++) {
    layerSizes.unshift(i + 1)
  }

  const maxElementsInLayer = Math.max(...layerSizes)
  const brickWidth = Math.min(
    canvasWidth * 0.2, // Max 20% of canvas width
    (canvasWidth - padding * 2) / (maxElementsInLayer + 0.5)
  )

  const brickHeight = brickWidth * 0.4

  const renderBricks = (): Array<ReactNode> | ReactNode => {
    if (canvasWidth === 0 || canvasHeight === 0) return null

    const allBricks = []

    for (let layerIndex = 0; layerIndex < layerSizes.length; layerIndex++) {
      const elementsInLayer = layerSizes[layerIndex]
      const valueForLayer = uniqueValues[layerIndex]
      const itemsForLayer = groupedData[valueForLayer]

      const positions = calculateBrickPositions(
        layerIndex,
        elementsInLayer,
        brickWidth,
        brickHeight,
        canvasWidth,
        canvasHeight,
        padding
      )

      for (let posIndex = 0; posIndex < positions.length; posIndex++) {
        const pos = positions[posIndex]

        if (posIndex < itemsForLayer.length) {
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

    const topLayer = layerSizes.length - 1

    const topPositions = calculateBrickPositions(
      topLayer,
      layerSizes[topLayer],
      brickWidth,
      brickHeight,
      canvasWidth,
      canvasHeight,
      padding
    )

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

  const renderMedals = () => {
    if (layerSizes.length < 3 || canvasWidth === 0 || canvasHeight === 0)
      return null

    const medals = []
    const medalSize = brickWidth * 0.8

    const topLayers = [
      layerSizes.length - 1,
      layerSizes.length - 2,
      layerSizes.length - 3,
    ]

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
        const pos = positions[0]
        const medalX = pos.x + brickWidth / 2

        const ribbonHeight = pos.y - medalSize / 2

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

  const rectWidth = canvasWidth * 0.4
  const rectHeight = canvasHeight * 0.1
  const rectX = canvasWidth / 16
  const rectY = padding / 2

  const titleFontSize = rectHeight * 0.25 // 50% of rect height

  const textX = rectX + rectWidth / 2 // Center text horizontally
  const textY = rectY + rectHeight / 2 + titleFontSize * 0.35 // Adjust for visual centering

  return (
    <div ref={containerRef} className="size-full">
      <svg
        className={cn("size-full", className)}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Title */}
        <rect
          x={rectX}
          y={rectY}
          width={rectWidth}
          height={rectHeight}
          rx="6"
          fill="#555"
          stroke="#000"
          strokeWidth="2"
        />

        <text
          x={textX}
          y={textY}
          textAnchor="middle"
          fontFamily="Arial"
          fontWeight="bold"
          fill="white"
          fontSize={titleFontSize}
        >
          {title}
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
