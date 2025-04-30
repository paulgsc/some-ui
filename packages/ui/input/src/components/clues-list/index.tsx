import type { FC } from "react"
import { useState } from "react"
import { ClueCard } from "@input/components/crossword-clue"
import type { CrosswordClue } from "@input/types/crossword"
import { cubeEventBus } from "some-ui-slideshow"
import { cn } from "some-ui-utils"

type ClueListProps = {
  className?: string
  clues: Array<CrosswordClue>
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
            thumbnail={curr.thumbnail}
            title={curr.title}
            clue={curr.channelInfo}
            updatedTime={curr.updatedTime}
            isActive={i === activeIndex}
          />
        </li>
      ))}
    </ul>
  )
}
