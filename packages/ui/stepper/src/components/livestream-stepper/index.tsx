import type { FC } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useAudioTTS } from "some-ui-utils"

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
  speechIntervalMinutes?: number
}

export const LivestreamTopicNotification: FC<
  LivestreamTopicNotificationProps
> = ({ playbackSpeed = 5, speechIntervalMinutes = 5 }): React.JSX.Element => {
  const [currentTime, setCurrentTime] = useState(0)
  const [activeToast, setActiveToast] = useState<Topic | null>(null)
  const [toastVisible, setToastVisible] = useState<boolean>(false)
  const [lastSpeechTime, setLastSpeechTime] = useState(0)

  const totalDuration = sampleTopics.reduce(
    (total, topic) => Math.max(total, topic.timestamp + topic.duration),
    0
  )

  const progressBarRef = useRef(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)
  const hideToastTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Initialize TTS with proper configuration
  const { speak, speaking } = useAudioTTS({
    service: {
      provider: "openai",
      apiUrl: "http://nixos.local:5050/v1/audio/speech",
      apiKey: "your_dummy_api_key_here",
      format: "mp3",
    },
    volume: 1.0,
    autoPlay: true, // Set to true for immediate playback
    onStart: () => {
      console.log("Speech started!")
      setToastVisible(true)
    },
    onEnd: () => {
      console.log("Speech ended!")
      // Schedule toast to hide after speech ends
      if (hideToastTimeoutRef.current) {
        clearTimeout(hideToastTimeoutRef.current)
      }
      hideToastTimeoutRef.current = setTimeout(() => {
        setToastVisible(false)
      }, 1500) // Hide 1.5s after speech ends
    },
    onError: (error) => {
      console.error("TTS Error:", error)
      setToastVisible(false)
    },
  })

  // Check if enough time has passed since last speech
  const shouldSpeak = useCallback(
    (currentTime: number): boolean => {
      const timeSinceLastSpeech = currentTime - lastSpeechTime
      console.log("delta;  ", timeSinceLastSpeech)
      return (
        timeSinceLastSpeech >= speechIntervalMinutes || lastSpeechTime === 0
      )
    },
    [speechIntervalMinutes, lastSpeechTime]
  )

  // Handle topic announcement
  const announceTopicIfNeeded = useCallback(
    async (topic: Topic) => {
      if (shouldSpeak(currentTime) && !speaking) {
        try {
          await speak(topic.title)
          setLastSpeechTime(currentTime)
          setActiveToast(topic)
        } catch (error) {
          console.error("Failed to announce topic:", error)
        }
      } else if (!speaking) {
        // Show toast without speech
        setActiveToast(topic)
        setToastVisible(true)
        if (hideToastTimeoutRef.current) {
          clearTimeout(hideToastTimeoutRef.current)
        }
        hideToastTimeoutRef.current = setTimeout(() => {
          setToastVisible(false)
        }, 3000) // Show for 3s without speech
      }
    },
    [currentTime, shouldSpeak, speaking, speak]
  )

  // Main time progression and topic detection effect
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentTime((prevTime) => {
        // Pause progression while speaking
        if (speaking) {
          return prevTime
        }

        const newTime = prevTime + playbackSpeed / 10

        // Loop back to beginning when reaching end
        if (newTime >= totalDuration) {
          return 0
        }

        // Check for topic at current timestamp
        const currentTopic = sampleTopics.find(
          (topic) =>
            newTime >= topic.timestamp &&
            newTime < topic.timestamp + 0.5 && // Only trigger at start of topic
            (!activeToast || activeToast.id !== topic.id) // Avoid duplicate announcements
        )

        if (currentTopic) {
          // Use setTimeout to avoid state update during render
          setTimeout(() => announceTopicIfNeeded(currentTopic), 0)
        }

        return newTime
      })
    }, 120)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [
    playbackSpeed,
    speaking,
    totalDuration,
    activeToast,
    announceTopicIfNeeded,
  ])

  // Reset speech timing when looping
  useEffect(() => {
    if (currentTime === 0) {
      setLastSpeechTime(0)
      setActiveToast(null)
      setToastVisible(false)
    }
  }, [currentTime])

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (hideToastTimeoutRef.current) {
        clearTimeout(hideToastTimeoutRef.current)
      }
    }
  }, [])

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

          {/* Speech indicator */}
          {speaking && (
            <div className="absolute right-4 top-1 flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="h-2 w-1 animate-pulse bg-red-500"></div>
                <div
                  className="h-2 w-1 animate-pulse bg-red-500"
                  style={{ animationDelay: "0.1s" }}
                ></div>
                <div
                  className="h-2 w-1 animate-pulse bg-red-500"
                  style={{ animationDelay: "0.2s" }}
                ></div>
              </div>
              <span className="text-xs text-white">Speaking...</span>
            </div>
          )}
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
                    {speaking && (
                      <div className="ml-2 flex items-center">
                        <div className="mr-1 size-1 animate-pulse rounded-full bg-green-400"></div>
                        <span className="text-xs text-green-400">Speaking</span>
                      </div>
                    )}
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
