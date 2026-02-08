import { useEffect, useRef, useState } from "react"

// Sample event data - replace with your actual events
const sampleEvents = [
  {
    id: 1,
    title: "React Hooks Deep Dive",
    date: "2023-05-01",
    time: "14:00",
    duration: 90,
    completed: true,
  },
  {
    id: 2,
    title: "Building a Sudoku Game",
    date: "2023-05-03",
    time: "15:00",
    duration: 120,
    completed: true,
  },
  {
    id: 3,
    title: "Debugging Sudoku Init Bug",
    date: "2023-05-05",
    time: "14:30",
    duration: 60,
    current: true,
  },
  {
    id: 4,
    title: "Implementing Grid Map Visualization",
    date: "2023-05-08",
    time: "16:00",
    duration: 90,
    upcoming: true,
  },
  {
    id: 5,
    title: "Q&A: React Performance Tips",
    date: "2023-05-10",
    time: "15:00",
    duration: 60,
    upcoming: true,
  },
]

// Format date to display in a readable format
const formatDate = (dateString: string): string => {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    weekday: "short",
  }
  return new Date(dateString).toLocaleDateString("en-US", options)
}

// Format time to display in 12-hour format
const formatTime = (timeString: string): string => {
  const [hours = "", minutes = ""] = timeString.split(":")
  const hour = Number.parseInt(hours, 10)
  const ampm = hour >= 12 ? "PM" : "AM"
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}

// Format duration to display in hours and minutes
const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
}

export const LivestreamSchedule = (): React.JSX.Element => {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [shimmerOffset, setShimmerOffset] = useState(0)
  const [flickerState, setFlickerState] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // Create shimmer animation effect
  useEffect(() => {
    let animationFrame: number
    let startTime: number

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime

      // Complete cycle every 3 seconds
      const cycle = (elapsed % 3000) / 3000
      setShimmerOffset(cycle * 300 - 150)

      animationFrame = requestAnimationFrame(animate)
    }

    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [])

  // Create flickering effect for future events
  useEffect(() => {
    const flickerInterval = setInterval(() => {
      setFlickerState((prev) => !prev)
    }, 3000)
    return () => clearInterval(flickerInterval)
  }, [])

  // Group events by status
  const completedEvents = sampleEvents
    .filter((event) => event.completed)
    .slice(0, 2)
  const currentEvent = sampleEvents.find((event) => event.current)
  const upcomingEvents = sampleEvents
    .filter((event) => event.upcoming)
    .slice(0, 3)

  // SVG dimensions and layout constants
  const width = 360
  const height = 500
  const padding = 20
  const headerHeight = 50
  const footerHeight = 40
  const sectionSpacing = 25
  const eventHeight = 60
  const eventSpacing = 10

  // Calculate content area dimensions
  const contentWidth = width - padding * 2
  const contentStartY = headerHeight + padding

  // Calculate section positions
  let currentY = contentStartY

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-4/5"
      >
        <defs>
          {/* Gradient definitions */}
          <linearGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#581c87" />
          </linearGradient>

          <linearGradient
            id="currentGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="rgba(30, 58, 138, 0.4)" />
            <stop offset="100%" stopColor="rgba(88, 28, 135, 0.4)" />
          </linearGradient>

          <linearGradient id="futureGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(30, 58, 138, 0.3)" />
            <stop offset="100%" stopColor="rgba(88, 28, 135, 0.3)" />
          </linearGradient>

          {/* Shimmer effect */}
          <linearGradient
            id="shimmerGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="rgba(59, 130, 246, 0)" />
            <stop offset="50%" stopColor="rgba(59, 130, 246, 0.3)" />
            <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
          </linearGradient>

          {/* Filter for glow effect */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Grayscale filter for past events */}
          <filter id="grayscale">
            <feColorMatrix
              type="matrix"
              values="0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0 0 0 1 0"
            />
          </filter>
        </defs>

        {/* Background */}
        <rect
          width={width}
          height={height}
          rx="10"
          fill="#111827"
          stroke="#1f2937"
          strokeWidth="1"
        />

        {/* Header */}
        <rect
          width={width}
          height={headerHeight}
          rx="10"
          ry="10"
          fill="url(#headerGradient)"
        />
        <text
          x={padding + 25}
          y={headerHeight / 2 + 5}
          fill="white"
          fontSize="16"
          fontWeight="600"
        >
          Stream Schedule
        </text>
        <text
          x={width - padding}
          y={headerHeight / 2 + 5}
          fill="white"
          fontSize="12"
          textAnchor="end"
          opacity="0.9"
        >
          {currentTime.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </text>

        {/* Calendar icon */}
        <svg
          x={padding}
          y={headerHeight / 2 - 10}
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
        >
          <rect
            x="3"
            y="4"
            width="18"
            height="18"
            rx="2"
            ry="2"
            stroke="white"
            strokeWidth="2"
          />
          <line x1="16" y1="2" x2="16" y2="6" stroke="white" strokeWidth="2" />
          <line x1="8" y1="2" x2="8" y2="6" stroke="white" strokeWidth="2" />
          <line x1="3" y1="10" x2="21" y2="10" stroke="white" strokeWidth="2" />
        </svg>

        {/* Content area */}
        <rect
          x={padding}
          y={contentStartY}
          width={contentWidth}
          height={height - headerHeight - footerHeight - padding}
          fill="none"
        />

        {/* Past Events Section */}
        {completedEvents.length > 0 && (
          <g filter="url(#grayscale)" opacity="0.7">
            <text
              x={padding}
              y={currentY}
              fill="#9ca3af"
              fontSize="12"
              fontWeight="500"
              letterSpacing="0.05em"
              style={{ textTransform: "uppercase" }}
            >
              Previous
            </text>

            {completedEvents.map((event, index) => {
              const eventY =
                currentY + 20 + index * (eventHeight + eventSpacing)

              return (
                <g key={event.id}>
                  <rect
                    x={padding}
                    y={eventY}
                    width={contentWidth}
                    height={eventHeight}
                    rx="5"
                    fill="#1f2937"
                    stroke="#374151"
                    strokeWidth="1"
                  />

                  {/* Check icon */}
                  <circle
                    cx={padding + 15}
                    cy={eventY + 20}
                    r="10"
                    fill="none"
                    stroke="#9ca3af"
                    strokeWidth="2"
                  />
                  <polyline
                    points={`${padding + 10},${eventY + 20} ${padding + 15},${eventY + 25} ${padding + 20},${eventY + 15}`}
                    fill="none"
                    stroke="#9ca3af"
                    strokeWidth="2"
                  />

                  {/* Event details */}
                  <text
                    x={padding + 35}
                    y={eventY + 20}
                    fill="#d1d5db"
                    fontSize="14"
                    fontWeight="500"
                  >
                    {event.title}
                  </text>
                  <text
                    x={padding + 35}
                    y={eventY + 40}
                    fill="#6b7280"
                    fontSize="12"
                  >
                    {formatDate(event.date)} • {formatTime(event.time)} •{" "}
                    {formatDuration(event.duration)}
                  </text>
                </g>
              )
            })}

            {
              (currentY =
                currentY +
                20 +
                completedEvents.length * (eventHeight + eventSpacing))
            }
          </g>
        )}

        {/* Current Event Section */}
        {currentEvent && (
          <g>
            <text
              x={padding}
              y={currentY + sectionSpacing}
              fill="#60a5fa"
              fontSize="12"
              fontWeight="500"
              letterSpacing="0.05em"
              style={{ textTransform: "uppercase" }}
            >
              Now Streaming
            </text>

            {(() => {
              const eventY = currentY + sectionSpacing + 20

              return (
                <g>
                  {/* Event background with glow */}
                  <rect
                    x={padding}
                    y={eventY}
                    width={contentWidth}
                    height={eventHeight + 10}
                    rx="8"
                    fill="url(#currentGradient)"
                    stroke="#3b82f6"
                    strokeWidth="1.5"
                    filter="url(#glow)"
                  />

                  {/* Shimmer effect */}
                  <rect
                    x={padding + shimmerOffset}
                    y={eventY}
                    width="150"
                    height={eventHeight + 10}
                    rx="8"
                    fill="url(#shimmerGradient)"
                    opacity="0.7"
                  />

                  {/* Clock icon */}
                  <circle
                    cx={padding + 15}
                    cy={eventY + 25}
                    r="10"
                    fill="none"
                    stroke="#60a5fa"
                    strokeWidth="2"
                  />
                  <line
                    x1={padding + 15}
                    y1={eventY + 25}
                    x2={padding + 15}
                    y2={eventY + 18}
                    stroke="#60a5fa"
                    strokeWidth="2"
                  />
                  <line
                    x1={padding + 15}
                    y1={eventY + 25}
                    x2={padding + 20}
                    y2={eventY + 25}
                    stroke="#60a5fa"
                    strokeWidth="2"
                  />

                  {/* Live indicator */}
                  <circle
                    cx={padding + 25}
                    cy={eventY + 15}
                    r="4"
                    fill="#ef4444"
                  >
                    <animate
                      attributeName="opacity"
                      values="1;0.5;1"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>

                  {/* Event details */}
                  <text
                    x={padding + 35}
                    y={eventY + 25}
                    fill="white"
                    fontSize="15"
                    fontWeight="bold"
                  >
                    {currentEvent.title}
                  </text>
                  <text
                    x={padding + 35}
                    y={eventY + 45}
                    fill="#93c5fd"
                    fontSize="13"
                  >
                    Started at {formatTime(currentEvent.time)} •{" "}
                    {formatDuration(currentEvent.duration)}
                  </text>
                </g>
              )
            })()}

            {(currentY = currentY + sectionSpacing + 20 + eventHeight + 10)}
          </g>
        )}

        {/* Future Events Section */}
        {upcomingEvents.length > 0 && (
          <g>
            <text
              x={padding}
              y={currentY + sectionSpacing}
              fill="#c084fc"
              fontSize="12"
              fontWeight="500"
              letterSpacing="0.05em"
              style={{ textTransform: "uppercase" }}
            >
              Upcoming
            </text>

            {upcomingEvents.map((event, index) => {
              const eventY =
                currentY +
                sectionSpacing +
                20 +
                index * (eventHeight + eventSpacing)
              const isFlickering =
                (index % 2 === 0 && flickerState) ||
                (index % 2 === 1 && !flickerState)

              return (
                <g key={event.id} opacity={isFlickering ? "0.95" : "1"}>
                  <rect
                    x={padding}
                    y={eventY}
                    width={contentWidth}
                    height={eventHeight}
                    rx="8"
                    fill="url(#futureGradient)"
                    stroke={isFlickering ? "#9333ea" : "#3b82f6"}
                    strokeWidth="1"
                    strokeOpacity="0.5"
                  />

                  {/* Circle icon with ping effect */}
                  <circle
                    cx={padding + 15}
                    cy={eventY + 20}
                    r="8"
                    fill="none"
                    stroke={isFlickering ? "#c084fc" : "#60a5fa"}
                    strokeWidth="2"
                  />

                  {index % 3 === 0 && (
                    <circle
                      cx={padding + 15}
                      cy={eventY + 20}
                      r="8"
                      fill="none"
                      stroke="#c084fc"
                      strokeWidth="2"
                      opacity="0.3"
                    >
                      <animate
                        attributeName="r"
                        values="8;12;8"
                        dur="3s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.3;0;0.3"
                        dur="3s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  {/* Event details */}
                  <text
                    x={padding + 35}
                    y={eventY + 20}
                    fill="#f3f4f6"
                    fontSize="14"
                    fontWeight="500"
                  >
                    {event.title}
                  </text>
                  <text
                    x={padding + 35}
                    y={eventY + 40}
                    fill={isFlickering ? "#ddd6fe" : "#bfdbfe"}
                    fontSize="12"
                  >
                    {formatDate(event.date)} • {formatTime(event.time)} •{" "}
                    {formatDuration(event.duration)}
                  </text>
                </g>
              )
            })}

            {
              (currentY =
                currentY +
                sectionSpacing +
                20 +
                upcomingEvents.length * (eventHeight + eventSpacing))
            }
          </g>
        )}

        {/* Footer */}
        <rect
          x={0}
          y={height - footerHeight}
          width={width}
          height={footerHeight}
          fill="#1f2937"
          rx="0"
          ry="0"
        />
      </svg>
    </div>
  )
}
