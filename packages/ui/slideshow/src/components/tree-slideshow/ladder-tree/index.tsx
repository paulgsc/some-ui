import type { FC, ReactNode } from "react"
import { ConnectingLine } from "@slideshow/components/tree-slideshow/connecting-line"
import { LadderNode } from "@slideshow/components/tree-slideshow/ladder-node"
import { useAnimatedNodes, useLadderTree } from "@slideshow/hooks/node-tree"
import { cn } from "some-ui-utils"

type LadderTreeSvgProps = {
  elements?: Array<ReactNode>
  className?: string
}

export const LadderTreeSvg: FC<LadderTreeSvgProps> = ({
  elements,
  className,
}) => {
  const { visibleCount, startAnimation, resetAnimation, animating } =
    useAnimatedNodes(elements.length, animationSpeed)
  const { points, svgBounds } = useLadderTree(elements, params)
  const viewBox = `${svgBounds.minX} ${svgBounds.minY} ${svgBounds.maxX - svgBounds.minX} ${svgBounds.maxY - svgBounds.minY}`
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className={cn("size-full", className)}
    >
      {/* Draw connecting lines */}
      {points.slice(0, visibleCount).map((point, i) => {
        if (i === 0) return null // Skip the first point as it has no incoming line
        return (
          <ConnectingLine
            key={`line-${i}`}
            startX={points[i - 1].x}
            startY={points[i - 1].y}
            endX={point.x}
            endY={point.y}
            animated={true}
            delay={(i - 1) * animationSpeed}
          />
        )
      })}

      {/* Draw nodes */}
      {points.slice(0, visibleCount).map((point, i) => (
        <LadderNode
          key={`node-${i}`}
          id={point.id}
          x={point.x}
          y={point.y}
          width={params.w}
          height={params.w * 0.75}
          animated={i > 0}
          delay={i * animationSpeed - animationSpeed / 2}
        />
      ))}

      {/* Draw the dots at midpoints of lines */}
      {points.slice(0, visibleCount).map((point, i) => {
        if (i === 0) return null // Skip the first point as it has no incoming line
        const midX = (points[i - 1].x + point.x) / 2
        const midY = (points[i - 1].y + point.y) / 2
        return (
          <circle
            key={`dot-${i}`}
            cx={midX}
            cy={midY}
            r={3}
            fill="black"
            style={{
              opacity: 0,
              animation: `fadeIn 0.3s ease-out ${i * animationSpeed - animationSpeed / 4}ms forwards`,
            }}
          />
        )
      })}

      <style>
        {`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                @keyframes fadeIn {
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    from { opacity: 0; }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    to { opacity: 1; }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                `}
      </style>
    </svg>
  )
}
