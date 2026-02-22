import type { Dispatch, SetStateAction } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import type {
  AccordionSteps,
  StepStatus,
} from "@stepper/types/accordion-stepper"
import { createSequentialCycler } from "some-ui-utils"

export type StepKey = `step_${number}`

type Options = {
  steps: AccordionSteps
  interval?: number
  autoplay?: boolean
  stepsToShow: number
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
  getStepIcon: (index: number) => StepStatus["progress"]
  visibleSteps: AccordionSteps["data"]
}

export const useAccordionStepper = ({
  interval = 60 * 1000,
  autoplay = false,
  stepsToShow,
  steps,
}: Options): ReturnOptions => {
  const [currStepId, setCurrStepId] = useState<StepKey>("step_0")
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [visibleSteps, setVisibleSteps] = useState<AccordionSteps["data"]>([])

  const animationRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const elapsedTimeRef = useRef<number>(0)
  const cyclerRef = useRef<() => AccordionSteps["data"] | null>(null)

  const onNext = useCallback((): void => {
    if (stepsToShow <= 0) return

    setCurrStepId((prev) => {
      const parts = prev.split("_")
      const rawIndex = parts[1]

      if (!rawIndex) return prev

      const prevIndex = Number(rawIndex)
      if (!Number.isInteger(prevIndex)) return prev

      const nextIndex = prevIndex + 1
      const wrapped = nextIndex % stepsToShow

      if (nextIndex >= stepsToShow) {
        getNextBatchOfSteps()
      }

      return `step_${wrapped}`
    })
  }, [stepsToShow])

  const onPrev = useCallback((): void => {
    if (stepsToShow <= 0) return

    setCurrStepId((prev) => {
      const parts = prev.split("_")
      const rawIndex = parts[1]

      if (!rawIndex) return prev

      const prevIndex = Number(rawIndex)
      if (!Number.isInteger(prevIndex)) return prev

      const nextIndex = prevIndex - 1

      const wrapped = ((nextIndex % stepsToShow) + stepsToShow) % stepsToShow

      if (nextIndex < 0) {
        getNextBatchOfSteps()
      }

      return `step_${wrapped}`
    })
  }, [stepsToShow])

  const onJumpTo = useCallback(
    (target: number) => {
      setCurrStepId(`step_${Math.abs(target) % stepsToShow}`)
    },
    [stepsToShow]
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

  const getStepIcon = useCallback(
    (index: number) => {
      const step = visibleSteps[index]
      if (!step) return "pending"
      return step.progress
    },
    [visibleSteps]
  )

  const initializeCycler = useCallback(() => {
    const cycler = createSequentialCycler(steps.data, stepsToShow)
    if (!cyclerRef.current) cyclerRef.current = cycler
  }, [steps, stepsToShow])

  const getNextBatchOfSteps = useCallback(() => {
    if (cyclerRef.current) setVisibleSteps(cyclerRef.current() ?? [])
  }, [])

  useEffect(() => {
    initializeCycler()
    getNextBatchOfSteps()
  }, [initializeCycler, getNextBatchOfSteps])

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
    getStepIcon,
    visibleSteps,
  }
}
