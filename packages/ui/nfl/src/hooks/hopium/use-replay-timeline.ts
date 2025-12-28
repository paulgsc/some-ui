import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { MoodEvent } from "@nfl/types/hopium/hopium-tracker"
import { aggregateWeekTallies } from "@nfl/utils/hopium/mood"

type ReplayOptions = {
  animateMs?: number // Recharts animation duration when advancing
  pauseMs?: number // dwell time at each point
  loop?: boolean
  speedMultiplier?: number // 0.5, 1, 2, etc.
}

export function useReplayTimeline(
  allEvents: Array<MoodEvent>,
  opts: ReplayOptions = {}
) {
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

  const current = allEvents[index]
  const maxIndex = allEvents.length - 1

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const scheduleNext = useCallback(() => {
    clearTimer()
    // Total dwell time per step
    const total = (animateMs + pauseMs) / speed
    timerRef.current = setTimeout(() => {
      setIndex((i) => {
        if (i >= maxIndex) return loop ? 0 : i
        return i + 1
      })
    }, total)
  }, [animateMs, pauseMs, speed, loop, maxIndex])

  useEffect(() => {
    if (!playing) {
      clearTimer()
      return
    }
    scheduleNext()
    return clearTimer
  }, [playing, index, scheduleNext])

  const play = useCallback(() => setPlaying(true), [])
  const pause = useCallback(() => setPlaying(false), [])
  const toggle = useCallback(() => setPlaying((p) => !p), [])
  const next = useCallback(
    () => setIndex((i) => (i >= maxIndex ? (loop ? 0 : i) : i + 1)),
    [loop, maxIndex]
  )
  const prev = useCallback(
    () => setIndex((i) => (i <= 0 ? (loop ? maxIndex : 0) : i - 1)),
    [loop, maxIndex]
  )
  const reset = useCallback(() => setIndex(0), [])

  const summaries = useMemo(
    () => aggregateWeekTallies(allEvents, index),
    [allEvents, index]
  )
  const currentWeek = current.week ?? summaries.at(-1)?.week ?? 1

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
