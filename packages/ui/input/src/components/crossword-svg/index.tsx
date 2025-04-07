import { useCrosswordPuzzle } from "@input/hooks/use-crossword-puzzle"
import type { CrosswordCell } from "@input/lib/crossword-grid"

export const CrosswordGridSvg = ({
  grid,
}: {
  grid: Array<CrosswordCell>
}): React.JSX.Element => {
  const {
    answers,
    activeClue,
    highlightedCells,
    isAnimating,
    cellRefs,
    handleInputChange,
    handleKeyDown,
  } = useCrosswordPuzzle(grid)
  return (
    <svg width="800" height="600" viewBox="0 0 800 600" className="max-w-full">
      <g transform="translate(100, 20)">
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
                    ref={(el) => (cellRefs.current[cellId] = el)}
                    type="text"
                    maxLength={1}
                    value={answers[cellId] || ""}
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
