import type { FC } from "react"
import { Clues } from "@input/components/crossword-clues"
import { CrosswordGridSvg } from "@input/components/crossword-svg"
import { CLUES } from "@input/data/crossword"
import type { CrosswordCell } from "@input/lib/crossword-grid"
import { Card } from "some-ui-shared"

type CrosswordPuzzleProps = {
  grid?: Array<CrosswordCell>
}
export const CrosswordPuzzle: FC<CrosswordPuzzleProps> = ({ grid = [] }) => {
  return (
    <Card className="mx-auto max-w-4xl p-6">
      <h1 className="mb-8 text-center text-3xl font-bold">
        Sheet for Kids (Easy)
      </h1>

      <div className="mb-8 flex justify-center">
        <CrosswordGridSvg grid={grid} />
      </div>

      <Clues
        clues={CLUES}
        activeClue={null}
        activeDirection={null}
        solvedClues={[]}
      />
    </Card>
  )
}
