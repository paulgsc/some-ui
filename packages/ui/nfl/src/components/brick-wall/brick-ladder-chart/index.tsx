import type { FC, ReactNode, RefObject } from "react"
import { useRef } from "react"
import { Brick } from "@nfl/components/brick-wall/brick"
import { Crown } from "@nfl/components/brick-wall/crown"
import { Medal } from "@nfl/components/brick-wall/medal"
import type { DataItem } from "@nfl/types/brick-wall"
import {
  calculateBrickPositions,
  calculateMaxLayerWidth,
} from "@nfl/utils/brick-layout"
import { cn, useMeasureRect } from "some-ui-utils"

type BrickWallChartProps = {
  data: Array<DataItem>
  title?: string
  className?: string
  layoutMode?: "pyramid" | "wall"
  horizontalSpacingRatio?: number
  verticalSpacingRatio?: number
}

export const BrickWallChart: FC<BrickWallChartProps> = ({
  data,
  title = "Some title...",
  className,
  layoutMode = "wall",
  horizontalSpacingRatio = 0.05,
  verticalSpacingRatio = 0.05,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { height, width } = useMeasureRect({
    ref: containerRef as RefObject<HTMLElement>,
  })

  const canvasWidth = width ?? 0
  const canvasHeight = height ?? 0
  const padding = Math.max(20, Math.min(50, canvasWidth * 0.05))

  // Sort data by value (ascending)
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

  // Get unique values (sorted)
  const uniqueValues = Object.keys(groupedData)
    .map(Number)
    .sort((a, b) => a - b)

  // Calculate maximum layer width (M in the spec)
  const maxLayerWidth = calculateMaxLayerWidth(groupedData)

  // Total number of layers (L in the spec)
  const totalLayers = uniqueValues.length

  // Calculate effective canvas dimensions (accounting for padding)
  const effectiveWidth = canvasWidth - 2 * padding
  const effectiveHeight = canvasHeight - 2 * padding

  const renderBricks = (): Array<ReactNode> | null => {
    if (canvasWidth === 0 || canvasHeight === 0 || uniqueValues.length === 0)
      return null

    const allBricks: Array<ReactNode> = []

    // Render each layer
    for (let layerIndex = 0; layerIndex < uniqueValues.length; layerIndex++) {
      const valueForLayer = uniqueValues[layerIndex]
      const itemsForLayer = groupedData[valueForLayer]
      const elementsInLayer = itemsForLayer.length

      // Calculate positions for this layer
      const positions = calculateBrickPositions(
        layerIndex,
        elementsInLayer,
        maxLayerWidth,
        totalLayers,
        effectiveWidth,
        effectiveHeight,
        horizontalSpacingRatio,
        verticalSpacingRatio,
        layoutMode
      )

      // Render each brick in the layer
      for (let i = 0; i < elementsInLayer; i++) {
        const item = itemsForLayer[i]
        const position = positions[i]

        // Adjust position to account for padding
        const adjustedPosition = {
          x: position.x + padding,
          y: position.y + padding,
          width: position.width,
          height: position.height,
        }

        const brick = {
          position: adjustedPosition,
          item,
          maxValue,
          minValue,
        }

        allBricks.push(<Brick key={`brick-${layerIndex}-${i}`} brick={brick} />)
      }
    }

    return allBricks
  }

  const renderCrown = (): ReactNode => {
    if (uniqueValues.length === 0 || canvasWidth === 0 || canvasHeight === 0)
      return null

    // Get the top layer
    const topValue = uniqueValues[uniqueValues.length - 1]
    const topLayerIndex = uniqueValues.length - 1
    const topLayerItems = groupedData[topValue]

    if (!topLayerItems || topLayerItems.length === 0) return null

    // Calculate positions for the top layer
    const positions = calculateBrickPositions(
      topLayerIndex,
      topLayerItems.length,
      maxLayerWidth,
      totalLayers,
      effectiveWidth,
      effectiveHeight,
      horizontalSpacingRatio,
      verticalSpacingRatio,
      layoutMode
    )

    // For pyramid layout, crown the middle brick
    // For wall layout, crown the rightmost brick
    const crownIndex =
      layoutMode === "pyramid"
        ? Math.floor(topLayerItems.length / 2)
        : topLayerItems.length - 1

    if (positions.length > crownIndex) {
      const topPos = positions[crownIndex]
      const crownX = topPos.x + topPos.width / 2 + padding
      const crownY = topPos.y + padding
      const crownWidth = topPos.width * 0.6
      const crownHeight = topPos.height * 0.5

      return (
        <Crown x={crownX} y={crownY} width={crownWidth} height={crownHeight} />
      )
    }

    return null
  }

  const renderMedals = (): Array<ReactNode> | null => {
    if (uniqueValues.length < 3 || canvasWidth === 0 || canvasHeight === 0)
      return null

    // Get the top three values
    const topThreeValues = uniqueValues.slice(-3).reverse()
    if (topThreeValues.length < 3) return null

    // Check if any medal position has multiple items (shared medals)
    const hasSharedMedals = topThreeValues.some(
      (value) => groupedData[value].length > 1
    )
    if (hasSharedMedals) return null

    const medals: Array<ReactNode> = []

    // Calculate medal positions for each of the top three layers
    for (let i = 0; i < 3; i++) {
      const value = topThreeValues[i]
      const layerIndex = uniqueValues.indexOf(value)
      const elementsInLayer = groupedData[value].length

      const positions = calculateBrickPositions(
        layerIndex,
        elementsInLayer,
        maxLayerWidth,
        totalLayers,
        effectiveWidth,
        effectiveHeight,
        horizontalSpacingRatio,
        verticalSpacingRatio,
        layoutMode
      )

      if (positions.length > 0) {
        // For pyramid layout, medal the middle brick
        // For wall layout, medal the rightmost brick
        const medalIndex =
          layoutMode === "pyramid"
            ? Math.floor(elementsInLayer / 2)
            : elementsInLayer - 1

        if (positions.length > medalIndex) {
          const pos = positions[medalIndex]
          const medalSize = pos.width * 0.8
          const medalX = pos.x + pos.width / 2 + padding
          const medalY = pos.y + padding - medalSize / 2
          const ribbonHeight = pos.y - medalSize / 2

          medals.push(
            <Medal
              key={`medal-${i}`}
              x={medalX}
              y={medalY}
              size={medalSize}
              type={i === 0 ? "gold" : i === 1 ? "silver" : "bronze"}
              ribbonHeight={ribbonHeight}
            />
          )
        }
      }
    }

    return medals
  }

  // Title dimensions and position
  const titleRectWidth = canvasWidth * 0.4
  const titleRectHeight = canvasHeight * 0.1
  const titleRectX = canvasWidth / 16
  const titleRectY = padding / 2
  const titleFontSize = titleRectHeight * 0.25
  const titleTextX = titleRectX + titleRectWidth / 2
  const titleTextY = titleRectY + titleRectHeight / 2 + titleFontSize * 0.35

  return (
    <div ref={containerRef} className="size-full">
      <svg
        className={cn("size-full", className)}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Title */}
        <rect
          x={titleRectX}
          y={titleRectY}
          width={titleRectWidth}
          height={titleRectHeight}
          rx="6"
          fill="#555"
          stroke="#000"
          strokeWidth="2"
        />
        <text
          x={titleTextX}
          y={titleTextY}
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
