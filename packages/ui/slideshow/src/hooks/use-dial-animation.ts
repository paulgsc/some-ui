import { useCallback, useEffect, useRef, useState } from "react"
import type {
  AnimationPattern,
  DialSection,
  SectionBounds,
} from "@slideshow/types/dial"

type UseDialAnimationProps = {
  sections: Array<DialSection>
  terminal: SectionBounds
  cycleTime: number
  animationPattern: AnimationPattern
}

export function useDialAnimation({
  sections,
  terminal,
  cycleTime,
  animationPattern,
}: UseDialAnimationProps) {
  const [currentAngle, setCurrentAngle] = useState(Math.random() * 360)
  const [progress, setProgress] = useState(0)

  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)

  const animate = (timestamp: number): void => {
    if (!startTimeRef.current) startTimeRef.current = timestamp
    const elapsed = timestamp - startTimeRef.current

    const cycleProgress = (elapsed % cycleTime) / cycleTime
    setProgress(cycleProgress * 100)

    let newAngle
    switch (animationPattern) {
      case "bounce": {
        const bounceProgress = cycleProgress * sections.length
        const sectionIndex = Math.floor(bounceProgress)
        const sectionProgress = bounceProgress - sectionIndex

        const bounceFactor =
          sectionProgress < 0.5
            ? 4 * sectionProgress * sectionProgress * sectionProgress
            : 1 - Math.pow(-2 * sectionProgress + 2, 3) / 2

        newAngle = (sectionIndex + bounceFactor) * (360 / sections.length)
        break
      }
      case "elastic": {
        const elasticProgress = cycleProgress * sections.length
        const elasticSectionIndex = Math.floor(elasticProgress)
        const elasticSectionProgress = elasticProgress - elasticSectionIndex

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
      }

      default: {
        newAngle = (elapsed / cycleTime) * 360
        break
      }
    }

    setCurrentAngle((prev) => {
      return (prev + newAngle) % 360 })

    animationRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    animationRef.current = requestAnimationFrame(animate)

    return (): void => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [animationPattern])

  return { currentAngle, setCurrentAngle, progress }
}
