import type { FC } from "react"
import { cn } from "some-ui-utils"

type ClueInfoProps = {
  title: string
  clue: string
  updatedTime: string
  isActive?: boolean
}

export const ClueInfo: FC<ClueInfoProps> = ({
  title,
  clue,
  updatedTime,
  isActive = false,
}) => {
  return (
    <div className="min-w-0 flex-1">
      <h3
        className={cn(
          "line-clamp-2 text-sm font-medium transition-colors duration-300",
          isActive ? "text-blue-700" : "text-neutral-900"
        )}
      >
        {title}
      </h3>

      <div className="mt-1 text-xs text-neutral-600">
        <p className="line-clamp-1">{clue}</p>
        <p>{updatedTime}</p>
      </div>
    </div>
  )
}
