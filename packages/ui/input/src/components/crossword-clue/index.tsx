import type { HTMLAttributes } from "react"
import { forwardRef } from "react"
import { ClueInfo } from "@input/components/clue-info"
import { ClueThumbnail } from "@input/components/clue-thumbnail"
import type { CrosswordClueWithNum } from "@input/types/crossword"
import { cn } from "some-ui-utils"

type ClueCardProps = {
  isActive?: boolean
  className?: string
} & CrosswordClueWithNum

export const ClueCard = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & ClueCardProps
>(
  (
    {
      className,
      clue,
      clueNum,
      word,
      thumbnail = "/placeholder.svg?height=94&width=168",
      isActive = false,
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "bg-card inset-shadow-sm relative flex size-full overflow-hidden rounded-lg  transition-all duration-300",
          "p-1.5",
          className,
          {
            "border-4 border-[oklch(50%_0.3_320deg)]": isActive,
          }
        )}
      >
        <div
          className={cn("flex size-full gap-1.5", {
            "animate-clue-rubber-band bg-blue-50 shadow-md": isActive,
          })}
        >
          {/* Shimmer effect overlay (only visible when active) */}
          {isActive && (
            <div className="shimmer-animation absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-blue-300/70 to-transparent" />
          )}

          <ClueThumbnail src={thumbnail} alt={word} isActive={isActive} />

          <ClueInfo clueNum={clueNum} clue={clue} isActive={isActive} />
        </div>
      </div>
    )
  }
)

ClueCard.displayName = "ClueCard"
