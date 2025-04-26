import type { Dispatch, SetStateAction } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { AccordionSteps } from "@stepper/types/accordion-stepper"
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
  getStepIcon: (index: number) => "done" | "progress" | "milestone"
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

  const onNext = useCallback(() => {
    setCurrStepId((prev) => {
      const prevIndex = parseInt(prev.split("_")[1], 0)
      const i = (prevIndex + 1) % stepsToShow
      if (prevIndex + 1 >= stepsToShow) getNextBatchOfSteps()
      return `step_${i}`
    })
  }, [stepsToShow])

  const onPrev = useCallback(() => {
    setCurrStepId((prev) => {
      const prevIndex = parseInt(prev.split("_")[1], 0)
      const i = Math.abs(prevIndex - 1) % stepsToShow
      if (Math.abs(prevIndex - 1) >= stepsToShow) getNextBatchOfSteps()
      return `step_${i}`
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
      const currentStepNumber = parseInt(currStepId.split("_")[1], 0)
      if (currentStepNumber > index) return "done"
      if (currentStepNumber === index) return "progress"
      return "milestone"
    },
    [currStepId]
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
