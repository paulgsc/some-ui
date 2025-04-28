import type { HTMLAttributes } from "react"
import { forwardRef } from "react"
import { ClueInfo } from "@input/components/clue-info"
import { ClueThumbnail } from "@input/components/clue-thumbnail"
import { cn } from "some-ui-utils"

type ClueCardProps = {
  thumbnail: string
  title: string
  clue: string
  updatedTime: string
  isActive?: boolean
  className?: string
}

export const ClueCard = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & ClueCardProps
>(
  (
    {
      className,
      thumbnail = "/placeholder.svg?height=94&width=168",
      title = "Mix - 剪 (Cut) - 李沫菲 (Li Mofei), 吉拉石林 (Jila Shilin)...",
      clue = "Zhang Yuan, Li Qi, Shang Wenjie, and more",
      updatedTime = "Updated today",
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
          className={cn("flex gap-1.5", {
            "animate-clue-rubber-band bg-blue-50 shadow-md": isActive,
          })}
        >
          {/* Shimmer effect overlay (only visible when active) */}
          {isActive && (
            <div className="shimmer-animation absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-blue-300/70 to-transparent" />
          )}

          <ClueThumbnail src={thumbnail} alt={title} isActive={isActive} />

          <ClueInfo
            title={title}
            clue={clue}
            updatedTime={updatedTime}
            isActive={isActive}
          />
        </div>
      </div>
    )
  }
)

ClueCard.displayName = "ClueCard"
