import { useCallback, useEffect, useRef, useState } from "react"
import type { AnimationPattern, SectionBounds } from "@slideshow/types/dial"

type UseCircularMotionProps = {
  sectionBounds: SectionBounds
  animationDuration?: number // in milliseconds
  animationPattern?: AnimationPattern
  initialAngle?: number
}

// Exhaustive validation utility for compile-time variant mapping
function assertNever(value: never): never {
  throw new Error(
    `Unhandled variant execution pathway: ${JSON.stringify(value)}`
  )
}

// Normalize angles cleanly between 0 and 2π boundaries
const normalizeAngle = (angle: number): number => {
  return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
}

export const useDialAnimation = ({
  sectionBounds,
  animationDuration = 2000,
  animationPattern = "elastic",
  initialAngle,
}: UseCircularMotionProps): {
  currentAngle: number
  setAngle: (angle: number) => void
  animateToMidpoint: () => void
  isAnimating: boolean
  isWithinSection: boolean
  midpointAngle: number
} => {
  // Pure Rendering: Random seeding handles lazily exactly once during tracking setup
  const [currentAngle, setCurrentAngle] = useState<number>(
    () => initialAngle ?? Math.random() * Math.PI * 2
  )
  const [isAnimating, setIsAnimating] = useState(false)

  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)

  // Anchor volatile contextual arguments inside mutable state registers
  const mutableStateRef = useRef({
    currentAngle,
    isAnimating,
    sectionBounds,
    animationDuration,
    animationPattern,
  })

  useEffect(() => {
    mutableStateRef.current = {
      currentAngle,
      isAnimating,
      sectionBounds,
      animationDuration,
      animationPattern,
    }
  }, [
    currentAngle,
    isAnimating,
    sectionBounds,
    animationDuration,
    animationPattern,
  ])

  // Derive target section calculations directly inside the evaluation frame
  const midpointAngle = (sectionBounds.startAngle + sectionBounds.endAngle) / 2
  const isWithinSection =
    currentAngle >= sectionBounds.startAngle &&
    currentAngle <= sectionBounds.endAngle

  // Pure mathematical algorithm pipeline for path interpolation
  const getShortestPathDirection = (from: number, to: number): 1 | -1 => {
    const clockwiseDist = to >= from ? to - from : 2 * Math.PI - from + to
    const counterclockwiseDist =
      from >= to ? from - to : 2 * Math.PI - to + from
    return clockwiseDist <= counterclockwiseDist ? 1 : -1
  }

  const applyAnimationPattern = (
    progress: number,
    pattern: AnimationPattern
  ): number => {
    switch (pattern) {
      case "linear": {
        return progress
      }
      case "bounce": {
        return 1 - Math.pow(1 - progress, 4) * Math.cos(progress * Math.PI * 4)
      }
      case "elastic": {
        const decay = 5
        const oscillation = 3
        return (
          1 -
          Math.exp(-decay * progress) *
            Math.cos(oscillation * Math.PI * progress)
        )
      }
      default: {
        return assertNever(pattern)
      }
    }
  }

  // Interaction entry point execution layer for running layout loops
  const animateToMidpoint = useCallback((): void => {
    if (mutableStateRef.current.isAnimating) {
      return
    }

    setIsAnimating(true)
    startTimeRef.current = null

    const animate = (timestamp: number): void => {
      startTimeRef.current ??= timestamp

      const currentContext = mutableStateRef.current
      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / currentContext.animationDuration, 1)
      const easedProgress = applyAnimationPattern(
        progress,
        currentContext.animationPattern
      )

      const bounds = currentContext.sectionBounds
      const mid = (bounds.startAngle + bounds.endAngle) / 2
      let nextAngle: number

      const currentAngleAtFrame = currentContext.currentAngle
      const baseWithinFrame =
        currentAngleAtFrame >= bounds.startAngle &&
        currentAngleAtFrame <= bounds.endAngle

      if (!baseWithinFrame && progress < 0.5) {
        const targetEntryPoint =
          getShortestPathDirection(currentAngleAtFrame, mid) === 1
            ? bounds.startAngle
            : bounds.endAngle

        const normalizedTarget = targetEntryPoint
        const normalizedCurrent = normalizeAngle(currentAngleAtFrame)
        const initialDiff = Math.abs(normalizedTarget - normalizedCurrent)

        const firstPhaseProgress = easedProgress * 2
        nextAngle =
          normalizedCurrent +
          getShortestPathDirection(normalizedCurrent, normalizedTarget) *
            initialDiff *
            firstPhaseProgress
      } else {
        const oscillationFrequency = 3
        const oscillationAmplitude =
          Math.abs(bounds.endAngle - bounds.startAngle) / 4
        const damping = 1 - easedProgress

        nextAngle =
          mid +
          oscillationAmplitude *
            damping *
            Math.sin(oscillationFrequency * Math.PI * easedProgress)
      }

      setCurrentAngle(nextAngle)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setCurrentAngle(mid)
        setIsAnimating(false)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [])

  // Safely trigger sync processing via an explicit effect setup flag
  const initialTriggerRef = useRef(false)
  useEffect(() => {
    if (!initialTriggerRef.current) {
      initialTriggerRef.current = true
      animateToMidpoint()
    }

    return (): void => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [animateToMidpoint])

  // Context callback mapping to decouple execution cycles cleanly
  const setAngle = useCallback((angle: number): void => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    setIsAnimating(false)
    setCurrentAngle(normalizeAngle(angle))
  }, [])

  return {
    currentAngle,
    setAngle,
    animateToMidpoint,
    isAnimating,
    isWithinSection,
    midpointAngle,
  }
}
