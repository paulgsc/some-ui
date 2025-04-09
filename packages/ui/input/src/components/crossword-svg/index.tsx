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
  const {
    activeClue,
    highlightedCells,
    isAnimating,
    cellRefs,
    handleInputChange,
    handleKeyDown,
  } = useCrosswordPuzzle(grid)
  return (
    <svg
      viewBox={`0 0 ${30 * gridSize} ${30 * gridSize}`}
      className={cn("size-full", className)}
    >
      <g>
        {grid.map((cell, index) => {
          const cellId = `${cell.x}-${cell.y}`
          const cellSize = 30
          const x = cell.x * cellSize
          const y = cell.y * cellSize
          const isHighlighted = highlightedCells.includes(cellId)

          return (
            <g key={index}>
              {/* Cell rectangle */}
              <rect
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                fill={isHighlighted ? "#FFEB3B" : "white"}
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
                  fontWeight={activeClue === cell.num ? "bold" : "normal"}
                  fill={activeClue === cell.num ? "#E91E63" : "black"}
                >
                  {cell.num}
                </text>
              )}

              {/* Cell input (using foreignObject) */}
              <foreignObject
                x={x + 2}
                y={y + (cell.num ? 8 : 2)}
                width={cellSize - 4}
                height={cellSize - (cell.num ? 10 : 4)}
              >
                <div className="flex size-full items-center justify-center">
                  <input
                    ref={(el) => {
                      cellRefs.current[cellId] = el
                    }}
                    type="text"
                    maxLength={1}
                    value={cell.letter}
                    onChange={(e) => handleInputChange(cellId, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, cell.x, cell.y)}
                    className={`size-full border-none text-center text-lg font-bold uppercase focus:outline-none focus:ring-2 focus:ring-offset-0 ${
                      isHighlighted
                        ? "bg-yellow-100 focus:ring-yellow-500"
                        : "focus:ring-green-500"
                    }`}
                    disabled={isAnimating}
                  />
                </div>
              </foreignObject>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
