import type { FC } from "react"
import { CrosswordCellSvg } from "@input/components/crossword-cell"
import { useCreateCrosswordWasm } from "@input/hooks/use-crossword-wasm"
import { useCreateCrosswordPuzzle } from "@input/hooks/use-grid-cells"
import type { CrosswordClues } from "@input/types/crossword"
import { cn } from "some-ui-utils"

type CrosswordGridSvgProps = {
  words: Array<string>
  clues: CrosswordClues
  className?: string
}
export const CrosswordGridSvg: FC<CrosswordGridSvgProps> = ({
  words,
  clues,
  className,
}): React.JSX.Element => {
  const cellSize = 30
  const { crossword } = useCreateCrosswordWasm(words)
  const { grid, calculateViewBox } = useCreateCrosswordPuzzle(
    crossword?.word_placements ?? [],
    clues
  )
  return (
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
  )
}
