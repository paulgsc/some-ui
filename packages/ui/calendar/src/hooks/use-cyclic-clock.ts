import { useCallback, useEffect, useRef, useState } from "react"

export type ClockState = {
  outer: number // 0–23 (Hours)
  inner: number // 0–59 (Minutes)
  running: boolean
  speed: number // ticks per second (1 tick = 1 minute increment)
}

type ClockActions = {
  toggleRunning: () => void
  setSpeed: (speed: number) => void
  reset: () => void
}

export function useCyclicClock(
  initialOuter = 0,
  initialInner = 0,
  initialSpeed = 1 / 60
): [ClockState, ClockActions] {
  const [state, setState] = useState<ClockState>({
    outer: initialOuter,
    inner: initialInner,
    running: true,
    speed: initialSpeed,
  })

  // We use refs for values needed inside the high-frequency loop
  // to avoid stale closures without restarting the effect.
  const runningRef = useRef(state.running)
  const speedRef = useRef(state.speed)
  const lastTickRef = useRef(performance.now())
  const accRef = useRef(0)

  // Sync refs with state
  useEffect(() => {
    runningRef.current = state.running
    speedRef.current = state.speed
  }, [state.running, state.speed])

  useEffect(() => {
    let frameId: number

    const loop = (now: number): void => {
      const dt = now - lastTickRef.current
      lastTickRef.current = now

      if (runningRef.current && speedRef.current > 0) {
        accRef.current += dt
        const msPerTick = 1000 / speedRef.current

        if (accRef.current >= msPerTick) {
          // Calculate how many ticks happened in this interval
          const ticksToProcess = Math.floor(accRef.current / msPerTick)
          accRef.current -= ticksToProcess * msPerTick

          setState((prev) => {
            // Convert current state to "total minutes" passed in the day
            const totalMinutes = prev.outer * 60 + prev.inner + ticksToProcess

            // Re-calculate cyclical positions
            // 1440 = 24 * 60 (total minutes in a day)
            const wrappedMinutes = totalMinutes % 1440

            return {
              ...prev,
              outer: Math.floor(wrappedMinutes / 60),
              inner: wrappedMinutes % 60,
            }
          })
        }
      }

      frameId = requestAnimationFrame(loop)
    }

    frameId = requestAnimationFrame(loop)
    return (): void => cancelAnimationFrame(frameId)
  }, [])

  const toggleRunning = useCallback(() => {
    setState((s) => ({ ...s, running: !s.running }))
  }, [])

  const setSpeed = useCallback((speed: number) => {
    setState((s) => ({ ...s, speed: Math.max(0, speed) }))
  }, [])

  const reset = useCallback(() => {
    setState((s) => ({ ...s, outer: 0, inner: 0 }))
  }, [])

  return [state, { toggleRunning, setSpeed, reset }]
}
