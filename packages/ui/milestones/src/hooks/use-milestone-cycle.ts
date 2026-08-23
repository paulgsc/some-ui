import { useCallback, useEffect, useState } from "react"
import { Y_AXIS_FACE_SEQUENCE } from "@milestones/lib/dice-face-order"
import { cubeEvents } from "@some-ui/dice-card"

type Options = {
  count: number
  cubeId: number
  intervalMs?: number
  autoplay?: boolean
}

type Return = {
  activeIndex: number
  isPlaying: boolean
  select: (index: number) => void
  togglePlaying: () => void
}

/**
 * The single source of truth for "which milestone is showing" — the dice
 * face and the timeline's expanded row are both derived from `activeIndex`
 * rather than kept as two independently-advancing timers, so they can never
 * drift out of sync with each other.
 */
export const useMilestoneCycle = ({
  count,
  cubeId,
  intervalMs = 5200,
  autoplay = true,
}: Options): Return => {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(autoplay)

  const select = useCallback(
    (index: number) => {
      if (count <= 0) return
      setActiveIndex(((index % count) + count) % count)
    },
    [count]
  )

  const togglePlaying = useCallback(
    () => setIsPlaying((playing) => !playing),
    []
  )

  useEffect(() => {
    if (!isPlaying || count <= 1) return undefined
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % count)
    }, intervalMs)
    return (): void => window.clearInterval(timer)
  }, [isPlaying, count, intervalMs])

  useEffect(() => {
    const face = Y_AXIS_FACE_SEQUENCE[activeIndex % Y_AXIS_FACE_SEQUENCE.length]
    if (face === undefined) return
    cubeEvents.emit("rotate:to", { id: cubeId, face })
  }, [activeIndex, cubeId])

  return { activeIndex, isPlaying, select, togglePlaying }
}
