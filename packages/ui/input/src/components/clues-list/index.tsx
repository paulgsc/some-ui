import type { FC } from "react"
import { ClueCard } from "@input/components/crossword-clue"
import type { CrosswordClueWithNum } from "@input/types/crossword"
import { cn } from "some-ui-utils"

type ClueListProps = {
  className?: string
  clues: Array<CrosswordClueWithNum>
  activeIndex?: number
  isActive: boolean
}

export const ClueList: FC<ClueListProps> = ({
  clues,
  className,
  isActive = false,
  activeIndex = 0,
}) => {
  if (!isActive)
    return <div className="size-full rounded-lg bg-white shadow-md" />

  return (
    <ul
      className={cn(
        "bg-card flex size-full flex-col items-center gap-3 overflow-clip px-2.5 py-2",
        "justify-around rounded-lg shadow-md backdrop-blur-sm",
        className
      )}
    >
      {clues.map((curr, i) => (
        <li key={`clue_${i}`} className={cn("")}>
          <ClueCard
            clue={curr.clue}
            clueNum={curr.clueNum}
            word={curr.word}
            isActive={i === activeIndex}
          />
        </li>
      ))}
    </ul>
  )
}
