import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { MoodEvent } from "@nfl/types/hopium/hopium-tracker"
import { aggregateWeekTallies, type WeeklyTally } from "@nfl/utils/hopium/mood"

export type ReplayOptions = {
  animateMs?: number // Recharts animation duration when advancing
  pauseMs?: number // dwell time at each point
  loop?: boolean
  speedMultiplier?: number // 0.5, 1, 2, etc.
}

export type ReplayTimelineHook = {
  index: number
  setIndex: (i: number) => void
  current: MoodEvent | undefined
  currentWeek: number
  playing: boolean
  play: () => void
  pause: () => void
  toggle: () => void
  next: () => void
  prev: () => void
  reset: () => void
  speed: number
  setSpeed: (s: number) => void
  animationDuration: number
  summaries: Array<WeeklyTally>
}

export function useReplayTimeline(
  allEvents: Array<MoodEvent>,
  opts: ReplayOptions = {}
): ReplayTimelineHook {
  const {
    animateMs = 600,
    pauseMs = 900,
    loop = true,
    speedMultiplier = 1,
  } = opts

  const [playing, setPlaying] = useState(true)
  const [index, setIndex] = useState(0)
  const [speed, setSpeed] = useState(speedMultiplier)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const maxIndex = allEvents.length - 1
  // Fix 18048: Standard array access can be undefined
  const current = allEvents[index]

  const clearTimer = useCallback((): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const scheduleNext = useCallback((): void => {
    clearTimer()
    const total = (animateMs + pauseMs) / speed
    timerRef.current = setTimeout(() => {
      setIndex((i) => {
        if (i >= maxIndex) return loop ? 0 : i
        return i + 1
      })
    }, total)
  }, [animateMs, pauseMs, speed, loop, maxIndex, clearTimer])

  useEffect(() => {
    if (!playing || allEvents.length === 0) {
      clearTimer()
      return
    }
    scheduleNext()
    return clearTimer
  }, [playing, index, scheduleNext, clearTimer, allEvents.length])

  const play = useCallback(() => setPlaying(true), [])
  const pause = useCallback(() => setPlaying(false), [])
  const toggle = useCallback(() => setPlaying((p) => !p), [])

  const next = useCallback((): void => {
    setIndex((i) => (i >= maxIndex ? (loop ? 0 : i) : i + 1))
  }, [loop, maxIndex])

  const prev = useCallback((): void => {
    setIndex((i) => (i <= 0 ? (loop ? maxIndex : 0) : i - 1))
  }, [loop, maxIndex])

  const reset = useCallback(() => setIndex(0), [])

  const summaries = useMemo(
    () => aggregateWeekTallies(allEvents, index),
    [allEvents, index]
  )

  /**
   * Fix 18048 & Unnecessary Condition:
   * We safely access week and provide a sensible fallback.
   */
  const currentWeek = useMemo(() => {
    if (current) return current.week
    return summaries.at(-1)?.week ?? 1
  }, [current, summaries])

  return {
    index,
    setIndex,
    current,
    currentWeek,
    playing,
    play,
    pause,
    toggle,
    next,
    prev,
    reset,
    speed,
    setSpeed,
    animationDuration: animateMs,
    summaries,
  }
}
