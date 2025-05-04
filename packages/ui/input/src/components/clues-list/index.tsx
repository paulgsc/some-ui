import type { FC } from "react"
import { ClueCard } from "@input/components/crossword-clue"
import type { CrosswordClueWithNum } from "@input/types/crossword"
import { cn } from "some-ui-utils"

type ClueListProps = {
  testIdx: number
  className?: string
  clues: Array<CrosswordClueWithNum>
  activeIndex?: number
  isActive: boolean
}

export const ClueList: FC<ClueListProps> = ({
  testIdx,
  clues,
  className,
  isActive = true,
  activeIndex = 0,
}) => {
  //if (!activeIndex) return <div className="size-full rounded-lg bg-white shadow-md" />

  return (
    <ul
      className={cn(
        "flex size-full flex-col items-center gap-3 overflow-clip bg-zinc-50 px-2.5 py-2",
        "justify-around rounded-lg shadow-md backdrop-blur-sm",
        className,
        {
          "size-fit": clues.length === 0,
        }
      )}
    >
      <h1 className="text-lg font-bold">face {testIdx} </h1>
      {clues.map((curr, i) => {
        const { clue, clueNum, word, thumbnail } = curr
        const args = {
          clue,
          clueNum,
          word,
          thumbnail,
          isActive: i === activeIndex,
        }

        return (
          <li key={`clue_${i}`} className={cn("")}>
            <ClueCard {...args} />
          </li>
        )
      })}
    </ul>
  )
}
