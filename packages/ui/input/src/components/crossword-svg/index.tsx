import type { FC } from "react"
import { useCrosswordPuzzle } from "@input/hooks/use-crossword-puzzle"
import type { CrosswordCell } from "@input/lib/crossword-grid"
import { cn } from "some-ui-utils"

type CrosswordGridSvgProps = {
  grid: Array<CrosswordCell>
  gridSize: number
  className?: string
}
export const CrosswordGridSvg: FC<CrosswordGridSvgProps> = ({
  grid,
  gridSize,
  className,
}): React.JSX.Element => {
  return (
    <svg
      viewBox={`0 0 ${30 * gridSize} ${30 * gridSize}`}
      className={cn("size-full", className)}
    >
      <g>
        {grid.map((cell, index) => {
          const cellSize = 30
          const x = cell.x * cellSize
          const y = cell.y * cellSize
          const centerX = cell.x * cellSize + cellSize / 2
          const centerY = cell.y * cellSize + cellSize / 2

          return (
            <g key={index}>
              {/* Cell rectangle */}
              <rect
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                fill={"white"}
                stroke="black"
                strokeWidth="1"
              />

              {/* Cell number */}
              {cell.num && (
                <text
                  x={x + 2}
                  y={y + 8}
                  fontSize="8"
                  textAnchor="start"
                  fontWeight={"normal"}
                  fill={"black"}
                >
                  {cell.num}
                </text>
              )}
              <text
                x={centerX}
                y={centerY}
                fontSize="16"
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="middle"
                fill={"black"}
              ></text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
