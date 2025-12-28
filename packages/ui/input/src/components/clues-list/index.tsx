import type { FC } from "react"
import { ClueCard } from "@input/components/crossword-clue"
import type { CrosswordClueWithNum } from "@input/types/crossword"
import { cn } from "some-ui-utils"

type ClueListProps = {
  title: string
  className?: string
  clues: Array<CrosswordClueWithNum>
  activeIndex?: number
}

export const ClueList: FC<ClueListProps> = ({
  title,
  clues,
  className,
  activeIndex = 0,
}) => {
  return (
    <ul
      className={cn(
        "flex size-full flex-col items-center gap-3 overflow-clip bg-zinc-50 px-2.5 py-2",
        "justify-start rounded-lg shadow-md backdrop-blur-sm",
        className,
        {
          "size-fit": clues.length === 0,
        }
      )}
    >
      <h2 className="inline-block border-b-4 border-emerald-500 pb-2 text-xl font-bold text-slate-800 md:text-5xl">
        {title}
      </h2>
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
