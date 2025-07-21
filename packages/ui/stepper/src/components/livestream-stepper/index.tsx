import type { FC } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useAudioTTS } from "some-ui-utils"

type Topic = {
  id: string | number
  title: string
  timestamp: number
  duration: number
}

const sampleTopics: Array<Topic> = [
  {
    id: 1,
    title:
      "Distracted studying. Can it be possible to watch drama, while studying. Well it doesn't matter, it's all meaningless anyhow",
    timestamp: 0,
    duration: 60,
  },
  {
    id: 2,
    title:
      "Typeracer: Why do we bother practicing how to type, couldn't tell ya! More meaningless slop",
    timestamp: 60,
    duration: 75,
  },
  {
    id: 3,
    title:
      "We hopefully learned enough so that I understand how the hyper crate is working. Suppose this is pure cope",
    timestamp: 75,
    duration: 115,
  },
  {
    id: 4,
    title:
      "Can it be possible that I can now fix some compiler error. Only future me knows, but I hazard a guess the answer is ...",
    timestamp: 115,
    duration: 145,
  },
]

// Format minutes to HH:MM:SS
const formatTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const mins = Math.floor(minutes % 60)
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:00`
}

type LivestreamTopicNotificationProps = {
  playbackSpeed?: number
  speechIntervalLoops?: number // Speak every N loops instead of time-based
  updateIntervalMs?: number // How often to update the timeline (milliseconds)
}

export const LivestreamTopicNotification: FC<
  LivestreamTopicNotificationProps
> = ({
  playbackSpeed = 5,
  speechIntervalLoops = 6,
  updateIntervalMs = 120,
}): React.JSX.Element => {
  const [currentTime, setCurrentTime] = useState(0)
  const [activeToast, setActiveToast] = useState<Topic | null>(null)
  const [toastVisible, setToastVisible] = useState<boolean>(false)

  // Track loops and segments separately
  const loopCountRef = useRef(0)
  const lastAnnouncedSegmentRef = useRef<string | number | null>(null)
  const lastShownSegmentRef = useRef<string | number | null>(null)
  const currentSpeechLoopRef = useRef<number>(-1) // Track which speech loop we're in
  const hideToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const totalDuration = sampleTopics.reduce(
    (total, topic) => Math.max(total, topic.timestamp + topic.duration),
    0
  )

  // Initialize TTS with proper configuration
  const { speak, speaking } = useAudioTTS({
    service: {
      provider: "openai",
      apiUrl: "http://nixos.local:5050/v1/audio/speech",
      apiKey: "your_dummy_api_key_here",
      format: "mp3",
    },
    volume: 1.0,
    autoPlay: true,
    onStart: () => {
      console.log("Speech started!")
    },
    onEnd: () => {
      console.log("Speech ended!")
      // Schedule toast to hide after speech ends
      if (hideToastTimeoutRef.current) {
        clearTimeout(hideToastTimeoutRef.current)
      }
      hideToastTimeoutRef.current = setTimeout(() => {
        setToastVisible(false)
        setActiveToast(null)
      }, 1500)
    },
    onError: (error) => {
      console.error("TTS Error:", error)
      setToastVisible(false)
      setActiveToast(null)
    },
  })

  // Find current topic based on timestamp
  const getCurrentTopic = useCallback((time: number): Topic | null => {
    return (
      sampleTopics.find(
        (topic) =>
          time >= topic.timestamp && time < topic.timestamp + topic.duration
      ) || null
    )
  }, [])

  // Show toast notification (without speech)
  const showToastNotification = useCallback(
    (topic: Topic) => {
      setActiveToast(topic)
      setToastVisible(true)
      lastShownSegmentRef.current = topic.id

      // Auto-hide toast after 3 seconds if not speaking
      if (hideToastTimeoutRef.current) {
        clearTimeout(hideToastTimeoutRef.current)
      }
      hideToastTimeoutRef.current = setTimeout(() => {
        if (!speaking) {
          setToastVisible(false)
          setActiveToast(null)
        }
      }, 3000)
    },
    [speaking]
  )

  // Announce topic with speech
  const announceTopicWithSpeech = useCallback(
    async (topic: Topic) => {
      if (speaking) return // Don't interrupt current speech

      try {
        setActiveToast(topic)
        setToastVisible(true)
        lastAnnouncedSegmentRef.current = topic.id
        lastShownSegmentRef.current = topic.id
        await speak(topic.title)
      } catch (error) {
        console.error("Failed to announce topic:", error)
        // Fallback to showing toast without speech
        showToastNotification(topic)
      }
    },
    [speaking, speak, showToastNotification]
  )

  // Main timeline progression effect
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentTime((prevTime) => {
        // Pause progression while speaking
        if (speaking) {
          return prevTime
        }

        let newTime = prevTime + playbackSpeed / 10

        // Handle loop completion
        if (newTime >= totalDuration) {
          newTime = 0
          loopCountRef.current += 1

          // Reset visual tracking when looping
          lastShownSegmentRef.current = null

          // Check if this is a new speech loop
          if (
            loopCountRef.current > 0 &&
            loopCountRef.current % speechIntervalLoops === 0
          ) {
            // Starting a new speech loop - reset speech tracking
            lastAnnouncedSegmentRef.current = null
            currentSpeechLoopRef.current = loopCountRef.current
            console.log(`Starting speech loop ${loopCountRef.current}`)
          }

          console.log(`Completed loop ${loopCountRef.current}`)
        }

        // Find current topic
        const currentTopic = getCurrentTopic(newTime)

        if (currentTopic) {
          // Check if we should speak - we're in a speech loop and haven't announced this segment yet in this speech loop
          const isCurrentlySpeechLoop =
            currentSpeechLoopRef.current === loopCountRef.current
          const shouldSpeak =
            isCurrentlySpeechLoop &&
            lastAnnouncedSegmentRef.current !== currentTopic.id

          const shouldShowToast =
            lastShownSegmentRef.current !== currentTopic.id

          if (shouldSpeak) {
            // Announce with speech (will also show toast)
            console.log(
              `Speaking on loop ${loopCountRef.current} for topic: ${currentTopic.title}`
            )
            setTimeout(() => announceTopicWithSpeech(currentTopic), 0)
          } else if (shouldShowToast) {
            // Show toast without speech
            setTimeout(() => showToastNotification(currentTopic), 0)
          }
        } else if (!currentTopic && activeToast) {
          // We've moved out of any topic segment, hide toast
          setTimeout(() => {
            setToastVisible(false)
            setActiveToast(null)
          }, 0)
        }

        return newTime
      })
    }, updateIntervalMs)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [
    playbackSpeed,
    updateIntervalMs,
    speaking,
    totalDuration,
    speechIntervalLoops,
    getCurrentTopic,
    announceTopicWithSpeech,
    showToastNotification,
    activeToast,
  ])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hideToastTimeoutRef.current) {
        clearTimeout(hideToastTimeoutRef.current)
      }
    }
  }, [])

  // Reset state on component mount/remount
  useEffect(() => {
    loopCountRef.current = 0
    lastAnnouncedSegmentRef.current = null
    lastShownSegmentRef.current = null
    currentSpeechLoopRef.current = -1
    setCurrentTime(0)
    setActiveToast(null)
    setToastVisible(false)
  }, [])

  return (
    <div className="absolute inset-0 opacity-95">
      <div className="relative size-full overflow-hidden bg-none">
        {/* Progress bar at bottom of screen */}
        <div className="absolute inset-x-0 bottom-0 h-8 bg-none">
          <div className="relative mx-2 mt-4 h-1 cursor-pointer bg-gray-700">
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

          {/* Loop and speech indicators */}
          <div className="absolute left-4 top-1 flex items-center space-x-4 text-xs text-white">
            <span>Loop: {loopCountRef.current}</span>
            <span>
              Next speech: Loop{" "}
              {Math.ceil((loopCountRef.current + 1) / speechIntervalLoops) *
                speechIntervalLoops}
            </span>
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
