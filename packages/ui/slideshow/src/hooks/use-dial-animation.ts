import { useEffect, useRef, useState } from "react"
import type { DialSection } from "@slideshow/types/dial"

type UseDialAnimationProps = {
  sections: Array<DialSection>
  cycleTime: number
  animationPattern: AnimationPattern
  isDragging: boolean
  isHovering: boolean
}

export type AnimationPattern = "linear" | "bounce" | "elastic"

export function useDialAnimation({
  sections,
  cycleTime,
  animationPattern,
  isDragging,
  isHovering,
}: UseDialAnimationProps) {
  const [currentAngle, setCurrentAngle] = useState(0)
  const [progress, setProgress] = useState(0)

  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)

  // Animation function with different patterns
  const animate = (timestamp: number) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp
    const elapsed = timestamp - startTimeRef.current

    // Calculate progress percentage
    const cycleProgress = (elapsed % cycleTime) / cycleTime
    setProgress(cycleProgress * 100)

    // Apply different animation patterns
    let newAngle
    switch (animationPattern) {
      case "bounce":
        // Bouncing effect at section boundaries
        const bounceProgress = cycleProgress * sections.length
        const sectionIndex = Math.floor(bounceProgress)
        const sectionProgress = bounceProgress - sectionIndex

        // Apply bounce easing
        const bounceFactor =
          sectionProgress < 0.5
            ? 4 * sectionProgress * sectionProgress * sectionProgress
            : 1 - Math.pow(-2 * sectionProgress + 2, 3) / 2

        newAngle = (sectionIndex + bounceFactor) * (360 / sections.length)
        break

      case "elastic":
        // Elastic effect
        const elasticProgress = cycleProgress * sections.length
        const elasticSectionIndex = Math.floor(elasticProgress)
        const elasticSectionProgress = elasticProgress - elasticSectionIndex

        // Apply elastic easing
        const c4 = (2 * Math.PI) / 3
        let elasticFactor

        if (elasticSectionProgress === 0) {
          elasticFactor = 0
        } else if (elasticSectionProgress === 1) {
          elasticFactor = 1
        } else {
          elasticFactor =
            Math.pow(2, -10 * elasticSectionProgress) *
              Math.sin((elasticSectionProgress * 10 - 0.75) * c4) +
            1
        }

        newAngle =
          (elasticSectionIndex + elasticFactor) * (360 / sections.length)
        break

      default: // linear
        newAngle = (elapsed / cycleTime) * 360
        break
    }

    if (!isDragging) {
      setCurrentAngle(newAngle % 360)
    }

    animationRef.current = requestAnimationFrame(animate)
  }

  // Start/stop animation based on hover/drag state
  useEffect(() => {
    if (!isHovering && !isDragging) {
      startTimeRef.current = null
      animationRef.current = requestAnimationFrame(animate)
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isHovering, isDragging, animationPattern])

  return { currentAngle, setCurrentAngle, progress }
}
