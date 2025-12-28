import type { GanttBaseProps } from "@slideshow/types/gantt"

type GanttPositionIndicatorProps = {
  currentTime: number
} & GanttBaseProps

/**
 * Component that renders the current position indicator in the Gantt chart
 */
export const GanttPositionIndicator = ({
  currentTime,
  totalDuration,
}: GanttPositionIndicatorProps) => {
  return (
    <div
      className="absolute inset-y-0 z-10 w-px bg-white"
      style={{
        left: `${(currentTime / totalDuration) * 100}%`,
        boxShadow: "0 0 8px rgba(255, 255, 255, 0.8)",
      }}
    >
      <div className="-ml-1.5 -mt-1 size-3 rounded-full bg-white"></div>
    </div>
  )
}
