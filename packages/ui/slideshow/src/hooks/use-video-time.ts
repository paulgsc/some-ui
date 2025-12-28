import { useEffect, useState } from "react"

/**
 * Options for the useVideoTime hook
 */
type UseVideoTimeOptions = {
  /** Total duration in seconds */
  totalDuration: number
  /** Simulation speed multiplier */
  simulationSpeed?: number
  /** Whether to loop when reaching the end */
  loop?: boolean
}

/**
 * Hook that simulates video playback time
 * In a real implementation, this would get the time from the YouTube API
 */
export function useVideoTime({
  totalDuration,
  simulationSpeed = 5,
  loop = true,
}: UseVideoTimeOptions) {
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime((prev) => {
        // Loop back to beginning when reaching the end if loop is true
        if (prev >= totalDuration - 10) {
          return loop ? 0 : totalDuration - 10
        }
        return prev + simulationSpeed
      })
    }, 1000)

    return () => clearInterval(timeInterval)
  }, [totalDuration, simulationSpeed, loop])

  return { currentTime, setCurrentTime }
}
