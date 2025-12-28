import { useEffect, useRef, useState } from "react"
import type { GameState } from "@input/types/leetype"

type UseGameTimerProps = {
  gameState: GameState
  duration: number
  onTimeout: () => void
}

type UseGameTimerReturnType = {
  timeLeft: number
}

export function useGameTimer({
  gameState,
  duration,
  onTimeout,
}: UseGameTimerProps): UseGameTimerReturnType {
  const [timeLeft, setTimeLeft] = useState(duration)

  const startTimeRef = useRef<number | null>(null)
  const pausedTimeRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  const onTimeoutRef = useRef(onTimeout)

  // Always keep latest callback without re-triggering effects
  useEffect(() => {
    onTimeoutRef.current = onTimeout
  }, [onTimeout])

  // Reset clock when duration changes
  useEffect(() => {
    startTimeRef.current = null
    pausedTimeRef.current = 0
    setTimeLeft(duration)
  }, [duration])

  useEffect(() => {
    if (gameState !== "playing") {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }

    if (startTimeRef.current === null) {
      startTimeRef.current = performance.now() - pausedTimeRef.current
    }

    const tick = (now: number): void => {
      const elapsed = now - startTimeRef.current!
      const remaining = Math.max(0, Math.ceil(duration - elapsed / 1000))

      setTimeLeft(remaining)

      if (remaining === 0) {
        onTimeoutRef.current()
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return (): void => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      pausedTimeRef.current = performance.now() - startTimeRef.current!
    }
  }, [gameState, duration])

  return { timeLeft }
}
