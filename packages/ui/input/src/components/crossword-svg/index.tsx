import type { FC } from "react"
import { useCreateCrosswordPuzzle } from "@input/hooks/use-create-crossword-puzzle"
import { cn } from "some-ui-utils"

import { CrosswordCellSvg } from "./test"

type CrosswordGridSvgProps = {
  words: Array<string>
  className?: string
}
export const CrosswordGridSvg: FC<CrosswordGridSvgProps> = ({
  words,
  className,
}): React.JSX.Element => {
  const cellSize = 30
  const { size, grid } = useCreateCrosswordPuzzle(words)
  return (
    <main>
      <p>
        {" "}
        {grid.length} {size}{" "}
      </p>

      <svg
        viewBox={calculateViewBox(grid)}
        className={cn("size-full", className)}
      >
        <g>
          {grid.map((cell, index) => {
            const cellId = `${cell.x}-${cell.y}`
            return (
              <CrosswordCellSvg key={cellId} cell={cell} cellSize={cellSize} />
            )
          })}
        </g>
      </svg>
    </main>
  )
}
function calculateViewBox(gridCells) {
  if (gridCells.length === 0) return "0 0 100 100" // Default for empty grid

  // Find min and max coordinates
  const minX = Math.min(...gridCells.map((cell) => cell.x))
  const maxX = Math.max(...gridCells.map((cell) => cell.x))
  const minY = Math.min(...gridCells.map((cell) => cell.y))
  const maxY = Math.max(...gridCells.map((cell) => cell.y))

  // Calculate dimensions with some padding
  const padding = 10
  const width = (maxX - minX + 1) * 30 + padding * 2
  const height = (maxY - minY + 1) * 30 + padding * 2

  // Return viewBox string
  return `${minX * 30 - padding} ${minY * 30 - padding} ${width} ${height}`
}
