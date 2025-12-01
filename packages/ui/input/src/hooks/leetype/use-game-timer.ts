import { useEffect, useRef, useState } from "react"
import {GameState} from "@input/types/leetype"


type UseGameTimerProps = {
  gameState: GameState
  duration: number
  onTimeout: () => void
}

export function useGameTimer({
  gameState,
  duration,
  onTimeout,
}: UseGameTimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setTimeLeft(duration)
  }, [duration])

  useEffect(() => {
    if (gameState === "playing") {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            onTimeout()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [gameState, onTimeout])

  return { timeLeft }
}
