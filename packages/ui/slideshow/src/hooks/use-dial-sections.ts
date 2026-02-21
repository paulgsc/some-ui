import { useMemo } from "react"
import type { DialSection } from "@slideshow/types/dial"

type SectionBoundary = {
  startAngle: number
  endAngle: number
}

type UseSectionCalculationsProps = {
  sections: Array<DialSection>
  uniformSections: boolean
}

type UseSectionCalculationsReturn = {
  sectionAngles: Array<number>
  sectionBoundaries: Array<SectionBoundary>
  getCurrentSection: (angle: number) => DialSection | undefined
}

export function useSectionCalculations(
  props: UseSectionCalculationsProps
): UseSectionCalculationsReturn {
  const { sections, uniformSections } = props

  const { sectionAngles, sectionBoundaries } = useMemo<{
    sectionAngles: Array<number>
    sectionBoundaries: Array<SectionBoundary>
  }>(() => {
    if (sections.length === 0) {
      return {
        sectionAngles: [],
        sectionBoundaries: [],
      }
    }

    const TOTAL_ANGLE = 360

    const rawAngles = uniformSections
      ? sections.map(() => TOTAL_ANGLE / sections.length)
      : sections.map((_, i) => 30 + ((i * 10) % 50))

    const sectionAngles = uniformSections
      ? rawAngles
      : (() => {
          const sum = rawAngles.reduce((acc, value) => acc + value, 0)
          const factor = TOTAL_ANGLE / sum
          return rawAngles.map((angle) => angle * factor)
        })()

    let cumulative = 0

    const sectionBoundaries = sectionAngles.map((angle) => {
      const startAngle = cumulative
      const endAngle = cumulative + angle
      cumulative = endAngle

      return { startAngle, endAngle }
    })

    return { sectionAngles, sectionBoundaries }
  }, [sections, uniformSections])

  const getCurrentSection = (angle: number): DialSection | undefined => {
    if (sections.length === 0) return undefined

    const normalizedAngle = ((angle % 360) + 360) % 360

    for (let i = 0; i < sectionBoundaries.length; i++) {
      const boundary = sectionBoundaries[i]
      if (!boundary) continue

      if (
        normalizedAngle >= boundary.startAngle &&
        normalizedAngle < boundary.endAngle
      ) {
        return sections[i]
      }
    }

    return sections[0]
  }

  return {
    sectionAngles,
    sectionBoundaries,
    getCurrentSection,
  }
}
