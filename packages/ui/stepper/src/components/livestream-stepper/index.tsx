import type { FC } from "react"
import { useEffect, useRef, useState } from "react"

type Topic = {
  id: string | number
  title: string
  timestamp: number
  duration: number
}
// Sample data for video topics
const sampleTopics: Array<Topic> = [
  { id: 1, title: "Setting up the project", timestamp: 0, duration: 15 },
  { id: 2, title: "React component basics", timestamp: 15, duration: 20 },
  {
    id: 3,
    title: "Implementing state management",
    timestamp: 35,
    duration: 25,
  },
  { id: 4, title: "Responsive design patterns", timestamp: 60, duration: 30 },
  { id: 5, title: "API integration", timestamp: 90, duration: 20 },
  { id: 6, title: "Testing React components", timestamp: 110, duration: 25 },
  { id: 7, title: "Performance optimization", timestamp: 135, duration: 15 },
  { id: 8, title: "Deployment strategies", timestamp: 150, duration: 20 },
  { id: 9, title: "Q&A session", timestamp: 170, duration: 10 },
]

// Format minutes to HH:MM:SS
const formatTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const mins = Math.floor(minutes % 60)
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:00`
}

type LivestreamTopicNotificationProps = {
  playbackSpeed?: number
}

export const LivestreamTopicNotification: FC<
  LivestreamTopicNotificationProps
> = ({ playbackSpeed = 5 }): React.JSX.Element => {
  const [currentTime, setCurrentTime] = useState(0)
  const [activeToast, setActiveToast] = useState<Topic | null>(null)
  const [toastVisible, setToastVisible] = useState(false)
  const totalDuration = sampleTopics.reduce(
    (total, topic) => Math.max(total, topic.timestamp + topic.duration),
    0
  )
  const progressBarRef = useRef(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Auto-advance time (simulating video playback)
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentTime((prevTime) => {
        const newTime = prevTime + playbackSpeed / 10
        if (newTime >= totalDuration) {
          return 0 // Loop back to beginning
        }
        return newTime
      })
    }, 100)

    return (): void => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [playbackSpeed, totalDuration])

  // Show toast notification when reaching a new topic
  useEffect(() => {
    const currentTopic = sampleTopics.find(
      (topic) =>
        currentTime >= topic.timestamp && currentTime < topic.timestamp + 0.5 // Show toast only at the start of a topic
    )

    if (currentTopic && (!activeToast || activeToast.id !== currentTopic.id)) {
      setActiveToast(currentTopic)
      setToastVisible(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)

      // Hide toast after 3 seconds
      timeoutRef.current = setTimeout(() => {
        setToastVisible(false)
      }, 3000)
    }
    return (): void => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [currentTime, activeToast])

  return (
    <div className="absolute inset-0 opacity-95">
      <div className="relative size-full overflow-hidden bg-none">
        {/* Progress bar at bottom of screen */}
        <div className="absolute inset-x-0 bottom-0 h-8 bg-none">
          <div
            ref={progressBarRef}
            className="relative mx-2 mt-4 h-1 cursor-pointer bg-gray-700"
          >
            {/* Progress indicator */}
            <div
              className="absolute left-0 top-0 h-full bg-red-600 transition-all duration-100"
              style={{ width: `${(currentTime / totalDuration) * 100}%` }}
            />

            {/* Topic markers */}
            {sampleTopics.map((topic) => (
              <div
                key={topic.id}
                className="absolute top-0 -mt-1 h-3 w-1 transform bg-white"
                style={{
                  left: `${(topic.timestamp / totalDuration) * 100}%`,
                }}
              />
            ))}

            {/* Current time marker */}
            <div
              className="absolute top-0 -ml-1.5 -mt-1 size-3 rounded-full bg-red-500 transition-all duration-100"
              style={{ left: `${(currentTime / totalDuration) * 100}%` }}
            />
          </div>
        </div>

        {/* Topic toast notification */}
        <div
          className={`absolute end-8 transform transition-all duration-300 ${
            toastVisible ? "bottom-10 opacity-100" : "bottom-0 opacity-0"
          }`}
        >
          {activeToast && (
            <div className="relative">
              <div className="absolute left-0 h-full w-1 bg-red-500"></div>
              <div className="relative ml-4">
                <div className="absolute -left-2 top-1/2 size-2 -translate-y-1/2 rotate-45 transform bg-red-500"></div>
                <div className="absolute -left-10 top-1/2 -translate-y-1/2 transform">
                  <svg
                    className="size-5 text-red-500"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14"></path>
                    <path d="M12 5l7 7-7 7"></path>
                  </svg>
                </div>
                <div className="rounded-md border border-gray-800 bg-black bg-opacity-80 px-3 py-2 shadow-lg">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-red-400">
                      {formatTime(activeToast.timestamp)}
                    </span>
                    <h3 className="text-sm font-medium text-white">
                      {activeToast.title}
                    </h3>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
