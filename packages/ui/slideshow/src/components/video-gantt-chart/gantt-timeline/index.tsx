import type { JSX } from "react"
import { useRef } from "react"
import { GanttChapters } from "@slideshow/components/video-gantt-chart/gantt-chapters"
import { GanttPositionIndicator } from "@slideshow/components/video-gantt-chart/gantt-indicator"
import { GanttTimeMarkers } from "@slideshow/components/video-gantt-chart/gantt-time-markers"
import type {
  Chapter,
  GanttBaseProps,
  GanttNavigationProps,
} from "@slideshow/types/gantt"
import { cn } from "some-ui-utils"

/**
 * Props for the GanttTimeline component
 */
type GanttTimelineProps = {
  /** Array of chapter data */
  chapters: Array<Chapter>
  /** Current time in seconds */
  currentTime: number
  /** Whether to show subchapters */
  showSubchapters?: boolean
  /** Function to format time display */
  formatTime: (seconds: number) => string
  className?: string
} & GanttBaseProps &
  GanttNavigationProps

export const GanttTimeline = ({
  chapters,
  totalDuration,
  currentTime,
  showSubchapters = true,
  formatTime,
  onJumpToTimestamp,
  className,
}: GanttTimelineProps): JSX.Element => {
  const timelineRef = useRef<HTMLDivElement>(null)
  const subChapters = chapters.flatMap((chapter) => chapter.subChapters)

  return (
    <div
      className={cn(
        "no-scrollbar relative min-h-52 w-full overflow-x-auto pb-2",
        className
      )}
      ref={timelineRef}
      style={{
        scrollBehavior: "smooth",
      }}
    >
      {/* Time markers */}
      <GanttTimeMarkers totalDuration={totalDuration} formatTime={formatTime} />

      {/* Main chapters */}
      <GanttChapters
        chapters={chapters}
        totalDuration={totalDuration}
        onJumpToTimestamp={onJumpToTimestamp}
      />

      {/* Subchapters (only shown when expanded) */}
      {showSubchapters && (
        <GanttChapters
          chapters={subChapters}
          totalDuration={totalDuration}
          onJumpToTimestamp={onJumpToTimestamp}
          className="top-20"
        />
      )}

      {/* Current position indicator */}
      <GanttPositionIndicator
        currentTime={currentTime}
        totalDuration={totalDuration}
      />
    </div>
  )
}
