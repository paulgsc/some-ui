import { useMemo } from "react"
import type { DialSection } from "@slideshow/types/dial"

type UseSectionCalculationsProps = {
  sections: Array<DialSection>
  uniformSections: boolean
  currentAngle: number
}

export function useSectionCalculations({
  sections,
  uniformSections,
  currentAngle,
}: UseSectionCalculationsProps) {
  // Calculate total angle for each section
  const { sectionAngles, sectionBoundaries } = useMemo(() => {
    const totalAngle = 360
    const sectionAngles = uniformSections
      ? sections.map(() => totalAngle / sections.length)
      : sections.map((_, i) => 30 + ((i * 10) % 50)) // Example of variable sizes

    // Normalize variable section angles to total 360 degrees
    if (!uniformSections) {
      const sum = sectionAngles.reduce((a, b) => a + b, 0)
      const factor = totalAngle / sum
      for (let i = 0; i < sectionAngles.length; i++) {
        sectionAngles[i] = sectionAngles[i] * factor
      }
    }

    // Calculate start and end angles for each section
    const sectionBoundaries = sections.map((_, index) => {
      const startAngle = sectionAngles
        .slice(0, index)
        .reduce((a, b) => a + b, 0)
      const endAngle = startAngle + sectionAngles[index]
      return { startAngle, endAngle }
    })

    return { sectionAngles, sectionBoundaries }
  }, [sections, uniformSections])

  // Function to determine which section the pointer is currently in
  const getCurrentSection = (angle: number) => {
    const normalizedAngle = angle % 360
    for (let i = 0; i < sectionBoundaries.length; i++) {
      const { startAngle, endAngle } = sectionBoundaries[i]
      if (normalizedAngle >= startAngle && normalizedAngle < endAngle) {
        return sections[i]
      }
    }
    return sections[0] // Fallback
  }

  const currentSection = getCurrentSection(currentAngle)

  return {
    sectionAngles,
    sectionBoundaries,
    getCurrentSection,
    currentSection,
  }
}
