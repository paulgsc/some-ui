/*
 *
 // TODO: This is an embarrasingly bad, hodge podge implementation
 // need to complete rewrite logic as rust api, and consume as wasm instead
 *
*/

import type { FC, ReactNode } from "react"
import { useCallback } from "react"
import { Brick } from "@nfl/components/brick-wall/brick"
import { Crown } from "@nfl/components/brick-wall/crown"
import { Medal } from "@nfl/components/brick-wall/medal"
import { calculateBrickPositions } from "@nfl/utils/brick-positions"
import { cn } from "some-ui-utils"

type DataItem = {
  name: string
  value: number
}

type BrickLadderChartProps = {
  data: Array<DataItem>
  canvasWidth: number
  canvasHeight: number
  title?: string
  className?: string
}

export const BrickLadderChart: FC<BrickLadderChartProps> = ({
  data,
  canvasWidth,
  canvasHeight,
  className,
  title = "Some title...",
}) => {
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

  const calculateAdaptiveBrickSize = useCallback(() => {
    if (canvasWidth === 0) return { width: 0, height: 0 }

    let maxRequiredElements = 0
    for (let layerIndex = 0; layerIndex < uniqueValues.length; layerIndex++) {
      let requiredElements = groupedData[uniqueValues[layerIndex]].length

      for (let i = layerIndex + 1; i < uniqueValues.length; i++) {
        const higherLayerItems = groupedData[uniqueValues[i]].length
        requiredElements = Math.max(requiredElements, higherLayerItems)
      }

      maxRequiredElements = Math.max(maxRequiredElements, requiredElements)
    }

    const spacing = 0.05
    const availableWidth = canvasWidth - padding * 2
    const layerDepthFactor = uniqueValues.length / 4 // layesrs of four render nicely?
    const maxBrickWidth =
      availableWidth /
      (layerDepthFactor * maxRequiredElements * (1 + spacing) - spacing)

    return { width: maxBrickWidth, height: maxBrickWidth * 0.4 }
  }, [canvasWidth, uniqueValues, groupedData, padding])

  const { width: brickWidth, height: brickHeight } =
    calculateAdaptiveBrickSize()

  const renderBricks = (): Array<ReactNode> | ReactNode => {
    if (canvasWidth === 0 || canvasHeight === 0) return null

    const allBricks = []

    for (let layerIndex = 0; layerIndex < uniqueValues.length; layerIndex++) {
      const valueForLayer = uniqueValues[layerIndex]
      const itemsForLayer = groupedData[valueForLayer]
      const elementsInLayer = itemsForLayer.length

      let requiredElements = elementsInLayer

      // Check if there are any layers above with more elements
      for (let i = layerIndex + 1; i < uniqueValues.length; i++) {
        const higherLayerValue = uniqueValues[i]
        const higherLayerItems = groupedData[higherLayerValue].length
        requiredElements = Math.max(requiredElements, higherLayerItems)
      }

      const positions = calculateBrickPositions(
        layerIndex,
        requiredElements,
        brickWidth,
        brickHeight,
        canvasWidth,
        canvasHeight,
        padding
      )

      for (let posIndex = 0; posIndex < positions.length; posIndex++) {
        const pos = positions[posIndex]

        if (posIndex < elementsInLayer) {
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

  const renderCrown = (): ReactNode => {
    if (uniqueValues.length === 0 || canvasWidth === 0 || canvasHeight === 0)
      return null

    const topValue = uniqueValues[uniqueValues.length - 1]
    const topLayerIndex = uniqueValues.length - 1

    const requiredElements = groupedData[topValue].length

    const positions = calculateBrickPositions(
      topLayerIndex,
      requiredElements,
      brickWidth,
      brickHeight,
      canvasWidth,
      canvasHeight,
      padding
    )

    if (positions.length > 0) {
      const topPos = positions[positions.length - 1]
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
    if (uniqueValues.length < 3 || canvasWidth === 0 || canvasHeight === 0)
      return null

    const topThreeValues = uniqueValues.slice(-3).reverse()
    if (topThreeValues.length < 3) return null

    const hasSharedMedals = topThreeValues.some(
      (value) => groupedData[value].length > 1
    )
    if (hasSharedMedals) return null

    const medals = []
    const medalSize = brickWidth * 0.8

    const topLayerIndices = [
      uniqueValues.indexOf(topThreeValues[0]),
      uniqueValues.indexOf(topThreeValues[1]),
      uniqueValues.indexOf(topThreeValues[2]),
    ]

    for (let i = 0; i < 3; i++) {
      const layerIndex = topLayerIndices[i]

      let requiredElements = groupedData[topThreeValues[i]].length
      for (let j = layerIndex + 1; j < uniqueValues.length; j++) {
        const higherLayerValue = uniqueValues[j]
        const higherLayerItems = groupedData[higherLayerValue].length
        requiredElements = Math.max(requiredElements, higherLayerItems)
      }

      const positions = calculateBrickPositions(
        layerIndex,
        requiredElements,
        brickWidth,
        brickHeight,
        canvasWidth,
        canvasHeight,
        padding
      )

      if (positions.length > 0) {
        // For right-aligned medals, use the rightmost brick position
        const pos = positions[positions.length - 1]
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
  )
}
