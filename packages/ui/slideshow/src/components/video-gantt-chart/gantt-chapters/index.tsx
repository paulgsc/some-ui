import type { CSSProperties } from "react"
import type {
  Chapter,
  GanttBaseProps,
  GanttNavigationProps,
  SubChapter,
} from "@slideshow/types/gantt"
import { cn } from "some-ui-utils"

type GanttChaptersProps = {
  /** Array of chapter data */
  chapters: Array<Chapter> | Array<SubChapter>
  /** Vertical position from the top */
  className?: string
} & GanttBaseProps &
  GanttNavigationProps

export const GanttChapters = ({
  chapters,
  totalDuration,
  onJumpToTimestamp,
  className,
}: GanttChaptersProps) => {
  return (
    <div className={cn("absolute inset-x-0 top-8 h-6", className)}>
      {chapters.map((chapter) => (
        <button
          key={chapter.id}
          className={cn(
            "absolute flex h-full cursor-pointer items-center justify-center overflow-hidden rounded-md",
            "transition-all hover:brightness-110",
            chapter.color
          )}
          style={{
            left: `${(chapter.startTime / totalDuration) * 100}%`,
            width: `${((chapter.endTime - chapter.startTime) / totalDuration) * 100}%`,
            minWidth: "10px",
          }}
          onClick={() => onJumpToTimestamp(chapter.startTime)}
        >
          {(chapter.endTime - chapter.startTime) / totalDuration > 0.05 && (
            <span className="truncate px-2 text-xs font-medium text-white">
              {chapter.title}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
