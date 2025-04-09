import type { FC } from "react"
import { Clues } from "@input/components/crossword-clues"
import { CrosswordGridSvg } from "@input/components/crossword-svg"
import { CLUES } from "@input/data/crossword"
import type { CrosswordCell } from "@input/lib/crossword-grid"

type CrosswordPuzzleProps = {
  grid: Array<CrosswordCell>
  size: number
}
export const CrosswordPuzzle: FC<CrosswordPuzzleProps> = ({ grid, size }) => {
  return (
    <div className="size-96 p-6">
      <h1 className="mb-8 text-center text-3xl font-bold">
        Sheet for Kids (Easy)
      </h1>

      <div className="mb-8 flex size-3/4 justify-center">
        <CrosswordGridSvg grid={grid} gridSize={size} />
      </div>

      <Clues direction="across" clues={CLUES.across} />
    </div>
  )
}
