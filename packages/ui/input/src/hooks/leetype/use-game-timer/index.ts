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
  const [previousDuration, setPreviousDuration] = useState(duration)

  const startTimeRef = useRef<number | null>(null)
  const pausedElapsedRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const onTimeoutRef = useRef(onTimeout)

  useEffect(() => {
    onTimeoutRef.current = onTimeout
  }, [onTimeout])

  // Allowed render-phase update.
  if (duration !== previousDuration) {
    setPreviousDuration(duration)
    setTimeLeft(duration)
  }

  // Reset imperative timer state after commit.
  useEffect(() => {
    startTimeRef.current = null
    pausedElapsedRef.current = 0
  }, [duration])

  useEffect(() => {
    if (gameState !== "playing") {
      return
    }

    startTimeRef.current ??= performance.now() - pausedElapsedRef.current

    const tick = (now: number): void => {
      const start = startTimeRef.current
      if (start === null) {
        return
      }

      const elapsed = now - start
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
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      if (startTimeRef.current !== null) {
        pausedElapsedRef.current = performance.now() - startTimeRef.current
        startTimeRef.current = null
      }
    }
  }, [gameState, duration])

  return { timeLeft }
}
