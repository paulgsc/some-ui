import type { Dispatch, SetStateAction } from "react"
import { useCallback, useEffect, useRef, useState } from "react"

export type StepKey = `step_${number}`

type Options = {
  interval?: number
  autoplay?: boolean
  totalSteps: number
}

type ReturnOptions = {
  currStepId: string
  setCurrStepId: Dispatch<SetStateAction<StepKey>>
  onNext: () => void
  onPrev: () => void
  onJumpTo: (target: number) => void
  isPlaying: boolean
  onAutoplay: () => void
  onStopAutoplay: () => void
}

export const useAccordionStepper = ({
  interval = 3 * 1000,
  autoplay = false,
  totalSteps,
}: Options): ReturnOptions => {
  const [currStepId, setCurrStepId] = useState<StepKey>("step_0")
  const [isPlaying, setIsPlaying] = useState<boolean>(false)

  const animationRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const elapsedTimeRef = useRef<number>(0)

  const onNext = useCallback(() => {
    setCurrStepId((prev) => {
      const prevIndex = parseInt(prev.split("_")[1], 0)
      const i = (prevIndex + 1) % totalSteps
      return `step_${i}`
    })
  }, [totalSteps])

  const onPrev = useCallback(() => {
    setCurrStepId((prev) => {
      const prevIndex = parseInt(prev.split("_")[1], 0)
      const i = Math.abs(prevIndex - 1) % totalSteps
      return `step_${i}`
    })
  }, [totalSteps])

  const onJumpTo = useCallback(
    (target: number) => {
      setCurrStepId(`step_${Math.abs(target) % totalSteps}`)
    },
    [totalSteps]
  )

  const onAutoplay = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    animationRef.current = requestAnimationFrame(animate)
    setIsPlaying(true)
  }, [])

  const onStopAutoplay = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    setIsPlaying(false)
  }, [])

  const animate = useCallback(
    (timestamp: number) => {
      if (!animationRef.current) lastTimeRef.current = timestamp

      const t = timestamp - lastTimeRef.current
      elapsedTimeRef.current += t
      lastTimeRef.current = timestamp

      if (elapsedTimeRef.current >= interval) {
        onNext()
        elapsedTimeRef.current = 0
      }

      animationRef.current = requestAnimationFrame(animate)
    },
    [interval, onNext]
  )

  useEffect(() => {
    if (autoplay) {
      onAutoplay()
    } else {
      onStopAutoplay()
    }

    return (): void => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [autoplay])

  return {
    currStepId,
    setCurrStepId,
    onNext,
    onPrev,
    onJumpTo,
    isPlaying,
    onAutoplay,
    onStopAutoplay,
  }
}
