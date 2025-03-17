import { useEffect, useRef, useState } from "react"
import { Brick } from "@nfl/components/brick-wall/brick"
import { Crown } from "@nfl/components/brick-wall/crown"

// Utility functions for mathematical calculations
const MathUtils = {
  /**
   * Calculate the number of layers and elements per layer
   * @param {number} totalElements - Total number of data points
   * @returns {Object} Layer distribution information
   */
  calculateLayerDistribution: (totalElements: number) => {
    // Using quadratic formula to solve: n(n+1)/2 = totalElements
    // This gives us the number of layers for a perfect triangle
    const n = Math.floor((Math.sqrt(8 * totalElements + 1) - 1) / 2)

    // Calculate how many elements we can fit in a perfect triangle
    const perfectTriangleElements = (n * (n + 1)) / 2

    // Calculate remaining elements
    const remaining = totalElements - perfectTriangleElements

    // Create layer distribution array
    const distribution = []

    // Fill the perfect triangle part (bottom to top)
    for (let i = n; i > 0; i--) {
      distribution.push(i)
    }

    // Handle any remaining elements by adding extra to bottom layers
    if (remaining > 0) {
      let extraIndex = 0
      for (let i = 0; i < remaining; i++) {
        distribution[extraIndex] += 1
        extraIndex =
          (extraIndex + 1) % Math.min(distribution.length, Math.ceil(n / 2))
      }
    }

    return {
      layers: distribution.length,
      elementsPerLayer: distribution,
      totalElementsUsed: totalElements,
    }
  },

  /**
   * Calculate brick positions for a given layer
   * @param {number} layerIndex - Current layer index (0 is bottom)
   * @param {number} elementsInLayer - Number of elements in this layer
   * @param {number} brickWidth - Width of each brick
   * @param {number} brickHeight - Height of each brick
   * @param {number} canvasWidth - Total canvas width
   * @param {number} canvasHeight - Total canvas height
   * @param {number} padding - Padding around the chart
   * @returns {Array} Array of brick positions for this layer
   */
  calculateBrickPositions: (
    layerIndex: number,
    elementsInLayer: number,
    brickWidth: number,
    brickHeight: number,
    canvasWidth: number,
    canvasHeight: number,
    padding: number
  ) => {
    const positions = []

    // Calculate total width needed for this layer
    const totalLayerWidth = elementsInLayer * brickWidth

    // Starting X position (centered)
    let startX = (canvasWidth - totalLayerWidth) / 2

    // Apply the brick pattern offset for this layer
    // Each layer shifts by half brick width to create the staggered effect
    startX += (layerIndex * brickWidth) / 2

    // Calculate Y position (bottom up)
    const y = canvasHeight - padding - (layerIndex + 1) * brickHeight * 1.5

    // Generate positions for each brick in the layer
    for (let i = 0; i < elementsInLayer; i++) {
      positions.push({
        x: startX + i * brickWidth,
        y: y,
        width: brickWidth,
        height: brickHeight,
      })
    }

    return positions
  },

  /**
   * Calculate normalized color intensity based on data value
   * @param {number} value - Data value
   * @param {number} min - Minimum value in dataset
   * @param {number} max - Maximum value in dataset
   * @returns {number} Normalized intensity between 0 and 1
   */
  normalizeColorIntensity: (value: number, min: number, max: number) => {
    // Handle edge case
    if (min === max) return 0.5

    // Calculate normalized value between 0 and 1
    return (value - min) / (max - min)
  },
}

type DataItem = {
  name: string
  value: number
}

type BrickLadderChartProps = {
  data: Array<DataItem>
  aspectRatio?: number // Optional aspect ratio (width/height)
}

// Main component
export const BrickLadderChart: React.FC<BrickLadderChartProps> = ({
  data,
  aspectRatio = 4 / 3, // Default aspect ratio
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  // Set up ResizeObserver to track container size changes
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length) return

      const { width } = entries[0].contentRect
      // Calculate height based on aspect ratio
      const height = width / aspectRatio

      setDimensions({ width, height })
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [aspectRatio])

  // Constants for chart dimensions
  const canvasWidth = dimensions.width
  const canvasHeight = dimensions.height
  const padding = Math.max(20, Math.min(50, canvasWidth * 0.05)) // Responsive padding

  // Process data
  const processedData = [...data].sort((a, b) => a.value - b.value)
  const minValue = Math.min(...processedData.map((d) => d.value))
  const maxValue = Math.max(...processedData.map((d) => d.value))

  // Calculate layer distribution
  const distribution = MathUtils.calculateLayerDistribution(
    processedData.length
  )
  const layerDistribution = distribution.elementsPerLayer

  // Set brick width based on canvas size and max elements in a layer
  const maxElementsInLayer = Math.max(...layerDistribution)
  const brickWidth = Math.min(
    canvasWidth * 0.2, // Max 20% of canvas width
    (canvasWidth - padding * 2) / (maxElementsInLayer + 0.5)
  )

  // Adjust brick height proportionally
  const brickHeight = brickWidth * 0.4

  // Generate bricks for all layers
  const renderBricks = () => {
    if (canvasWidth === 0 || canvasHeight === 0) return null

    const allBricks = []
    let dataIndex = 0

    for (
      let layerIndex = 0;
      layerIndex < layerDistribution.length;
      layerIndex++
    ) {
      const elementsInLayer = layerDistribution[layerIndex]

      // Calculate brick positions for this layer
      const positions = MathUtils.calculateBrickPositions(
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
        if (dataIndex >= processedData.length) break

        const item = processedData[dataIndex]
        const pos = positions[posIndex]
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

        allBricks.push(<Brick key={`brick-${dataIndex}`} brick={brick} />)

        dataIndex++
      }
    }

    return allBricks
  }

  // Render crown for the top element
  const renderCrown = () => {
    if (processedData.length === 0 || canvasWidth === 0 || canvasHeight === 0)
      return null

    const topLayer = layerDistribution.length - 1
    const topPos = MathUtils.calculateBrickPositions(
      topLayer,
      layerDistribution[topLayer],
      brickWidth,
      brickHeight,
      canvasWidth,
      canvasHeight,
      padding
    )[0]

    const crownX = topPos.x + brickWidth / 2
    const crownY = topPos.y
    const crownWidth = brickWidth * 0.6
    const crownHeight = brickHeight * 0.5

    return (
      <Crown x={crownX} y={crownY} width={crownWidth} height={crownHeight} />
    )
  }

  // Calculate title font size based on canvas width
  const titleFontSize = Math.max(12, Math.min(20, canvasWidth * 0.025))

  return (
    <div ref={containerRef} className="size-full">
      {dimensions.width > 0 && dimensions.height > 0 && (
        <svg
          width="100%"
          height="100%"
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

          {/* Render all bricks */}
          {renderBricks()}

          {/* Render crown for the winner */}
          {renderCrown()}
        </svg>
      )}
    </div>
  )
}
