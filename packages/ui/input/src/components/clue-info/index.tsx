import type { FC } from "react"
import { cn } from "some-ui-utils"

type ClueInfoProps = {
  clue: string
  isActive?: boolean
}

export const ClueInfo: FC<ClueInfoProps> = ({ clue, isActive = false }) => {
  return (
    <div className="flex min-w-0 flex-1 flex-row-reverse items-start justify-end gap-2.5 py-1.5">
      <h3
        className={cn(
          "line-clamp-2 h-full flex-grow text-balance text-sm font-semibold tracking-tight transition-colors duration-300",
          isActive ? "text-blue-700" : "text-neutral-900"
        )}
      >
        {clue}
      </h3>
    </div>
  )
}
