import { useEffect, useRef, useState } from "react"
import type { GameState } from "@leetype/types/leetype"

type UseGameTimerProps = {
  gameState: GameState
  duration: number
  onTimeout: () => void
  /**
   * Identity of the current run. Bump it to start the clock over.
   *
   * This is what separates "restart" from "pause", which the state machine
   * cannot express on its own: leaving `playing` means *pause* here (the
   * elapsed time is banked so resuming continues where it stopped), and every
   * exit — finishing, timing out, hitting Reset — looks identical from inside
   * this hook. Without a separate signal, a session that ran to timeout banked
   * a full duration of elapsed time, so the next `playing` resumed a clock
   * that was already spent and timed out on its first frame. The Reset button
   * appeared to do nothing, forever.
   *
   * Optional so a caller that never restarts (the preview/story harnesses)
   * keeps the old behaviour with no ceremony.
   */
  runId?: number
}

type UseGameTimerReturnType = {
  timeLeft: number
}

export function useGameTimer({
  gameState,
  duration,
  onTimeout,
  runId = 0,
}: UseGameTimerProps): UseGameTimerReturnType {
  const [timeLeft, setTimeLeft] = useState(duration)
  // The inputs that mean "this is a different run than the one being timed".
  // Kept as one object so the render-phase comparison below is a single
  // decision rather than two that can disagree.
  const [timedRun, setTimedRun] = useState({ duration, runId })

  const startTimeRef = useRef<number | null>(null)
  const pausedElapsedRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const onTimeoutRef = useRef(onTimeout)

  useEffect(() => {
    onTimeoutRef.current = onTimeout
  }, [onTimeout])

  // Allowed render-phase update.
  if (timedRun.duration !== duration || timedRun.runId !== runId) {
    setTimedRun({ duration, runId })
    setTimeLeft(duration)
  }

  // Reset imperative timer state after commit.
  //
  // Ordering matters and is load-bearing: React runs every cleanup before any
  // effect body, so the countdown effect's cleanup below banks its elapsed
  // time first and this zeroes it afterwards. A fresh run therefore starts
  // from a clean clock even though it was paused on the way out.
  useEffect(() => {
    startTimeRef.current = null
    pausedElapsedRef.current = 0
  }, [duration, runId])

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
  }, [gameState, duration, runId])

  return { timeLeft }
}
