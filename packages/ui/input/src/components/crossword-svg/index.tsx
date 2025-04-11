import type { FC } from "react"
import { CrosswordCellSvg } from "@input/components/crossword-cell"
import { useCreateCrosswordWasm } from "@input/hooks/use-crossword-wasm"
import { useCreateCrosswordPuzzle } from "@input/hooks/use-grid-cells"
import { useSolveAnimation } from "@input/hooks/use-solve-animation"
import { cn } from "some-ui-utils"

type CrosswordGridSvgProps = {
  words: Array<string>
  className?: string
}
export const CrosswordGridSvg: FC<CrosswordGridSvgProps> = ({
  words,
  className,
}): React.JSX.Element => {
  const cellSize = 30
  const { crossword } = useCreateCrosswordWasm(words)
  const { setGrid, grid, viewBox } = useCreateCrosswordPuzzle(
    crossword?.word_placements ?? []
  )

  // useSolveAnimation({ grid: [...grid], updateGrid: setGrid, duration: 3000 })
  console.log(grid, viewBox)
  return (
    <svg viewBox={viewBox} className={cn("size-full", className)}>
      <g>
        {grid.map((cell) => {
          const cellId = `${cell.x}-${cell.y}`
          return (
            <CrosswordCellSvg key={cellId} cell={cell} cellSize={cellSize} />
          )
        })}
      </g>
    </svg>
  )
}
