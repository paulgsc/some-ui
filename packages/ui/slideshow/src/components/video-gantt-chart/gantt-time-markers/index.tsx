import type { JSX } from "react"
import type { GanttBaseProps } from "@slideshow/types/gantt"

type GanttTimeMarkersProps = {
  /** Function to format time display */
  formatTime: (seconds: number) => string
  /** Interval between time markers in seconds */
  markerInterval?: number
} & GanttBaseProps

/**
 * Component that renders time markers along the timeline
 */
export const GanttTimeMarkers = ({
  totalDuration,
  formatTime,
  markerInterval = 600, // Default 10 minutes
}: GanttTimeMarkersProps): JSX.Element => {
  // Calculate number of markers needed
  const markerCount = Math.ceil(totalDuration / markerInterval) + 1

  return (
    <div className="absolute inset-x-0 top-0 flex text-xs text-gray-500">
      {Array.from({ length: markerCount }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col items-center"
          style={{
            position: "absolute",
            left: `${((i * markerInterval) / totalDuration) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="h-3 w-px bg-gray-700" />
          <div className="mt-1">{formatTime(i * markerInterval)}</div>
        </div>
      ))}
    </div>
  )
}
