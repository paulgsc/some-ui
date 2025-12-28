import type { FC } from "react"
import { useCallback, useEffect, useState } from "react"
import type { GrindStats } from "@portfolio-chart/types/grind-charts"
import { cn, getRandomSubarray } from "some-ui-utils"

type GrindPieChartProps = {
  stats: Array<GrindStats>
  title: string
  size?: number
}

type Segment = {
  path: string
  color: string
  item: GrindStats
}

export const GrindPieChart: FC<GrindPieChartProps> = ({
  stats,
  title,
  size = 120,
}) => {
  const [segments, setSegments] = useState<Array<Segment>>([])
  const [subStats, setSubStats] = useState<Array<GrindStats>>([])

  const getSegments = useCallback(() => {
    const total = stats.reduce((sum, item) => sum + item.value, 0)
    let currentAngle = 0

    // Create the segments for the donut chart
    const segments = stats.map((item) => {
      const startAngle = currentAngle
      const angle = (item.value / total) * 360
      currentAngle += angle
      const endAngle = currentAngle

      const startRad = ((startAngle - 90) * Math.PI) / 180
      const endRad = ((endAngle - 90) * Math.PI) / 180

      const outerRadius = size / 2
      const innerRadius = size / 3

      // Calculate the path for the donut segment
      const x1 = Math.cos(startRad) * innerRadius + size / 2
      const y1 = Math.sin(startRad) * innerRadius + size / 2
      const x2 = Math.cos(startRad) * outerRadius + size / 2
      const y2 = Math.sin(startRad) * outerRadius + size / 2
      const x3 = Math.cos(endRad) * outerRadius + size / 2
      const y3 = Math.sin(endRad) * outerRadius + size / 2
      const x4 = Math.cos(endRad) * innerRadius + size / 2
      const y4 = Math.sin(endRad) * innerRadius + size / 2

      // Flag for large arc (> 180 degrees)
      const largeArcFlag = angle > 180 ? 1 : 0

      // Path for donut segment
      const path = [
        `M ${x1} ${y1}`,
        `L ${x2} ${y2}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x3} ${y3}`,
        `L ${x4} ${y4}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x1} ${y1}`,
        "Z",
      ].join(" ")

      return {
        path,
        color: item.color,
        item,
      }
    })
    setSegments(segments)
    setSubStats(() => (stats.length <= 4 ? stats : getRandomSubarray(stats, 4)))
  }, [stats, size])

  useEffect(() => {
    getSegments()
  }, [getSegments])

  return (
    <div
      className={cn(
        "relative flex size-full flex-col items-center justify-end bg-gray-950 p-1.5",
        "shadow-inset-sm shadow-inset-gray-700 rounded-lg border border-gray-800",
        "overflow-clip"
      )}
    >
      <h3 className="start-1/8 absolute top-12 z-50 font-medium capitalize text-white">
        {title}
      </h3>
      <div className="relative size-28">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0 top-8 size-28"
        >
          {segments.map((segment, idx) => (
            <path
              key={idx}
              d={segment.path}
              fill={segment.color}
              stroke="#111"
              strokeWidth="0.5"
            >
              <title>{`${segment.item.name}: ${segment.item.value}`}</title>
            </path>
          ))}
        </svg>
      </div>
      {/* Legend */}
      <div className="mt-1 grid size-full grid-cols-2">
        {subStats.map((entry, index) => (
          <div key={index} className="flex items-center justify-center text-xs">
            <div
              className="mr-1 size-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="font-semibold tracking-tight text-white">
              {entry.name}: {entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
