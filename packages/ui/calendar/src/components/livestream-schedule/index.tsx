import { useEffect, useState } from "react"
import { Calendar, CheckCircle2, Circle, Clock } from "lucide-react"

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
  const [hours, minutes] = timeString.split(":")
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

export const LivestreamSchedule = () => {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [flickerState, setFlickerState] = useState(false)

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)
    return () => clearInterval(interval)
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

  return (
    <div className="w-full max-w-xs overflow-hidden rounded-lg border border-gray-800 bg-gray-900 shadow-lg">
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-900 to-purple-900 p-4 text-white">
        <div className="flex items-center space-x-2">
          <Calendar className="size-5" />
          <h3 className="text-lg font-semibold">Stream Schedule</h3>
        </div>
        <div className="text-sm opacity-90">
          {currentTime.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      </div>

      <div className="space-y-6 bg-gray-900 p-4">
        {/* Previous Events - Black and White Effect */}
        {completedEvents.length > 0 && (
          <div className="grayscale filter transition-all duration-500">
            <h4 className="mb-2 text-sm font-medium uppercase tracking-wider text-gray-500">
              Previous
            </h4>
            <div className="space-y-2">
              {completedEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start space-x-3 rounded border border-gray-800 bg-gray-800 p-2 opacity-60"
                >
                  <CheckCircle2 className="mt-0.5 size-5 flex-shrink-0 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-300">
                      {event.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(event.date)} • {formatTime(event.time)} •{" "}
                      {formatDuration(event.duration)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Event - Shimmer and Glow Effect */}
        {currentEvent && (
          <div className="relative">
            <h4 className="mb-2 text-sm font-medium uppercase tracking-wider text-blue-400">
              Now Streaming
            </h4>
            <div className="relative overflow-hidden rounded-lg border border-blue-500 bg-gradient-to-r from-blue-900/40 to-purple-900/40 p-4 shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              {/* Shimmer effect overlay */}
              <div className="shimmer-effect absolute inset-0"></div>

              <div className="relative z-10 flex items-start space-x-3">
                <div className="relative flex-shrink-0">
                  <Clock className="size-5 text-blue-400" />
                  <span className="absolute right-0 top-0 size-2 animate-pulse rounded-full bg-red-500"></span>
                </div>
                <div>
                  <p className="text-base font-bold text-white">
                    {currentEvent.title}
                  </p>
                  <p className="text-sm text-blue-300">
                    Started at {formatTime(currentEvent.time)} •{" "}
                    {formatDuration(currentEvent.duration)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upcoming Events - Flickering and Futuristic Theme */}
        {upcomingEvents.length > 0 && (
          <div
            className={`transition-all duration-300 ${flickerState ? "opacity-95" : "opacity-100"}`}
          >
            <h4 className="mb-2 text-sm font-medium uppercase tracking-wider text-purple-400">
              Upcoming
            </h4>
            <div className="space-y-3">
              {upcomingEvents.map((event, index) => (
                <div
                  key={event.id}
                  className={`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        flex items-start space-x-3 rounded-lg border
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            border-purple-800/50 bg-gradient-to-r from-blue-900/30
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                to-purple-900/30 p-3
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    ${index % 2 === 0 && flickerState ? "shadow-[0_0_8px_rgba(147,51,234,0.3)]" : ""}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ${index % 2 === 1 && !flickerState ? "shadow-[0_0_8px_rgba(59,130,246,0.3)]" : ""}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            transition-all duration-500
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              `}
                  style={{
                    animationDelay: `${index * 0.2}s`,
                  }}
                >
                  <div className="relative mt-0.5 flex-shrink-0">
                    <Circle
                      className={`size-5 ${flickerState ? "text-purple-400" : "text-blue-400"} transition-colors duration-500`}
                    />
                    <span
                      className={`absolute inset-0 ${index % 3 === 0 ? "animate-ping" : ""} size-full rounded-full bg-purple-400 opacity-30`}
                    ></span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-100">
                      {event.title}
                    </p>
                    <p
                      className={`text-xs ${flickerState ? "text-purple-300" : "text-blue-300"} transition-colors duration-500`}
                    >
                      {formatDate(event.date)} • {formatTime(event.time)} •{" "}
                      {formatDuration(event.duration)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
