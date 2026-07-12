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
  const [isPlaying, setIsPlaying] = useState<boolean>(autoplay)
  const [prevAutoplay, setPrevAutoplay] = useState(autoplay)
  const [visibleSteps, setVisibleSteps] = useState<AccordionSteps["data"]>([])

  const animationRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const elapsedTimeRef = useRef<number>(0)
  const cyclerRef = useRef<() => AccordionSteps["data"] | null>(null)

  // Keep isPlaying in sync when the autoplay prop changes, without an effect
  if (autoplay !== prevAutoplay) {
    setPrevAutoplay(autoplay)
    setIsPlaying(autoplay)
  }

  const getNextBatchOfSteps = useCallback(() => {
    if (cyclerRef.current) setVisibleSteps(cyclerRef.current() ?? [])
  }, [])

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
  }, [stepsToShow, getNextBatchOfSteps])

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
  }, [stepsToShow, getNextBatchOfSteps])

  const onJumpTo = useCallback(
    (target: number) => {
      setCurrStepId(`step_${Math.abs(target) % stepsToShow}`)
    },
    [stepsToShow]
  )

  // Self-recursive rAF loop: schedule through a ref rather than referencing
  // `animate` from within its own body, so each frame calls the latest
  // closure without a forward reference to the not-yet-declared `animate`.
  const animateRef = useRef<((timestamp: number) => void) | null>(null)

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

      if (animateRef.current) {
        animationRef.current = requestAnimationFrame(animateRef.current)
      }
    },
    [interval, onNext]
  )

  useEffect(() => {
    animateRef.current = animate
  })

  const onAutoplay = useCallback(() => {
    setIsPlaying(true)
  }, [])

  const onStopAutoplay = useCallback(() => {
    setIsPlaying(false)
  }, [])

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
    cyclerRef.current ??= cycler
  }, [steps, stepsToShow])

  useEffect(() => {
    initializeCycler()
    getNextBatchOfSteps()
  }, [initializeCycler, getNextBatchOfSteps])

  // Synchronize the rAF loop (external system) with isPlaying
  useEffect(() => {
    if (!isPlaying) return

    animationRef.current = requestAnimationFrame(animate)

    return (): void => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [isPlaying, animate])

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
