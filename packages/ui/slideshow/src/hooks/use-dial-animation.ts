import { useCallback, useEffect, useRef, useState } from "react"
import type { AnimationPattern, SectionBounds } from "@slideshow/types/dial"

type UseCircularMotionProps = {
  sectionBounds: SectionBounds
  animationDuration?: number // in milliseconds
  animationPattern?: AnimationPattern
  initialAngle?: number
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
  const [currentAngle, setCurrentAngle] = useState<number>(
    initialAngle !== undefined ? initialAngle : Math.random() * Math.PI * 2
  )

  const [isAnimating, setIsAnimating] = useState(false)
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)

  // Normalize angles to be between 0 and 2π
  const normalizeAngle = (angle: number): number => {
    return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  }

  // Calculate midpoint of the section
  const getMidpointAngle = (): number => {
    const { startAngle, endAngle } = sectionBounds

    return (startAngle + endAngle) / 2
  }

  // Check if current angle is within the section
  const isWithinSection = useCallback(
    (angle: number): boolean => {
      const { startAngle, endAngle } = sectionBounds

      return angle >= startAngle && angle <= endAngle
    },
    [sectionBounds]
  )

  // Calculate the shortest path direction (clockwise or counterclockwise)
  const getShortestPathDirection = (from: number, to: number): 1 | -1 => {
    const normFrom = from
    const normTo = to

    let clockwiseDist =
      normTo >= normFrom ? normTo - normFrom : 2 * Math.PI - normFrom + normTo

    let counterclockwiseDist =
      normFrom >= normTo ? normFrom - normTo : 2 * Math.PI - normTo + normFrom

    return clockwiseDist <= counterclockwiseDist ? 1 : -1
  }

  // Apply animation pattern
  const applyAnimationPattern = (progress: number): number => {
    switch (animationPattern) {
      case "linear":
        return progress
      case "bounce":
        // Bounce effect: slow down and bounce at end
        return 1 - Math.pow(1 - progress, 4) * Math.cos(progress * Math.PI * 4)
      case "elastic":
      default:
        // Damped oscillation: exponentially decreasing oscillation
        const decay = 5 // Controls damping rate
        const oscillation = 3 // Controls number of oscillations
        return (
          1 -
          Math.exp(-decay * progress) *
            Math.cos(oscillation * Math.PI * progress)
        )
    }
  }

  // Start animation
  const animateToMidpoint = useCallback(() => {
    if (isAnimating) return

    setIsAnimating(true)
    startTimeRef.current = null

    const animate = (timestamp: number): void => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp
      }

      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / animationDuration, 1)
      const easedProgress = applyAnimationPattern(progress)

      const midpoint = getMidpointAngle()
      let newAngle: number

      if (!isWithinSection(currentAngle) && progress < 0.5) {
        // First phase: move to enter the section
        const targetEntryPoint =
          getShortestPathDirection(currentAngle, midpoint) === 1
            ? sectionBounds.startAngle
            : sectionBounds.endAngle

        // Normalize for shortest path
        const normalizedTarget = targetEntryPoint
        const normalizedCurrent = normalizeAngle(currentAngle)
        const initialDiff = Math.abs(normalizedTarget - normalizedCurrent)

        // Apply easing with an accelerated first half
        const firstPhaseProgress = easedProgress * 2 // Accelerate to finish in half the time
        newAngle =
          normalizedCurrent +
          getShortestPathDirection(normalizedCurrent, normalizedTarget) *
            initialDiff *
            firstPhaseProgress
      } else {
        // Second phase: oscillate within section and settle at midpoint
        const oscillationFrequency = 3 // Controls number of oscillations
        const oscillationAmplitude =
          Math.abs(sectionBounds.endAngle - sectionBounds.startAngle) / 4
        const damping = 1 - easedProgress // Dampening factor

        // Apply damped oscillation around midpoint
        newAngle =
          midpoint +
          oscillationAmplitude *
            damping *
            Math.sin(oscillationFrequency * Math.PI * easedProgress)
      }

      setCurrentAngle(newAngle)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        // Ensure final position is exactly at midpoint
        setCurrentAngle(midpoint)
        setIsAnimating(false)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }, [sectionBounds])

  // Cancel animation on unmount
  useEffect(() => {
    animateToMidpoint()
    return (): void => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  // Helper to manually set angle
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
    isWithinSection: isWithinSection(currentAngle),
    midpointAngle: getMidpointAngle(),
  }
}
