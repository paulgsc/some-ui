import { useState } from "react"
import { DialPieSection } from "@slideshow/components/dial-components/dial-section"
import { useDialAnimation } from "@slideshow/hooks/use-dial-animation"
import { useSectionCalculations } from "@slideshow/hooks/use-dial-sections"
import type { AnimationPattern, DialSection } from "@slideshow/types/dial"
import {
  calculateTrianglePoints,
  generateSectionPath,
  getSectionTextPosition,
} from "@slideshow/utils/dial-utils"
import { cn } from "some-ui-utils"

type DialProps = {
  center: number
  animationDuration: number
  animationPattern: AnimationPattern
  uniformSections: boolean
  sections: Array<DialSection>
  className?: string
}

export const Dial = ({
  center,
  animationDuration,
  animationPattern,
  uniformSections,
  sections,
  className,
}: DialProps): React.JSX.Element => {
  const innerRadius = 0.7 * center
  const outerRadius = 0.95 * center
  const tHW = (outerRadius - innerRadius) * 0.6
  const radius = (innerRadius + outerRadius) / 2

  const [zoomedSection, setZoomedSection] = useState<number | null>(null)

  const { sectionBoundaries } = useSectionCalculations({
    sections,
    uniformSections,
  })

  const { currentAngle } = useDialAnimation({
    animationDuration,
    animationPattern,
    sectionBounds: sectionBoundaries[2],
  })

  return (
    <svg
      className={cn("size-full", className)}
      viewBox={`0 0 ${center * 2} ${center * 2}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      {/* Outer ring with 3D effect */}
      <circle
        cx={center}
        cy={center}
        r={outerRadius}
        fill="none"
        stroke="#333"
        strokeWidth="1"
      />
      <circle
        cx={center}
        cy={center}
        r={outerRadius}
        fill="none"
        stroke="rgba(255,255,255,0.8)"
        strokeWidth="2"
        filter="drop-shadow(0px 2px 3px rgba(0,0,0,0.2))"
      />

      <g>
        {/* Dial sections */}
        {sections.map((section, index) => {
          const { startAngle, endAngle } = sectionBoundaries[index]
          const path = generateSectionPath({
            startAngle,
            endAngle,
            innerRadius,
            outerRadius,
            center,
          })
          const isZoomed = zoomedSection === index
          const textPos = getSectionTextPosition({
            sectionIndex: index,
            radius,
            sectionBoundaries,
            center,
          })

          return (
            <DialPieSection
              key={section.id}
              section={section}
              radius={radius}
              path={path}
              isZoomed={isZoomed}
              index={index}
              setZoomedSection={setZoomedSection}
              textPosition={textPos}
            />
          )
        })}
      </g>

      {/* Section dividing lines */}
      {sectionBoundaries.map((boundary, index) => {
        const radians = (boundary.startAngle - 90) * (Math.PI / 180)
        const x1 = center + innerRadius * Math.cos(radians)
        const y1 = center + innerRadius * Math.sin(radians)
        const x2 = center + outerRadius * Math.cos(radians)
        const y2 = center + outerRadius * Math.sin(radians)
        const isZoomed =
          zoomedSection === index ||
          (zoomedSection &&
            (zoomedSection + 1) % sectionBoundaries.length === index)
        const scale = isZoomed ? 1.05 : 1

        return (
          <line
            key={index}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#333"
            strokeWidth={center * 0.015}
            transform={`scale(${scale}) translate(${(1 - scale) * 50}, ${(1 - scale) * 50})`}
          />
        )
      })}

      {/* Center circle with 3D effect */}
      <circle
        cx={center}
        cy={center}
        r={innerRadius}
        fill="#FFC0CB"
        filter="drop-shadow(0px 3px 5px rgba(0,0,0,0.2))"
      />
      <circle
        cx={center}
        cy={center}
        r={innerRadius}
        fill="url(#centerGradient)"
        filter="drop-shadow(0px 3px 5px rgba(0,0,0,0.2))"
      />

      {/* Pointer */}
      <g transform={`rotate(${currentAngle}, ${center}, ${center})`}>
        <polygon
          points={calculateTrianglePoints(
            center,
            center,
            outerRadius * 0.95,
            currentAngle,
            tHW,
            tHW
          )}
          fill={"#FF7F7F"}
          stroke="#333"
          strokeWidth="1"
          filter="drop-shadow(0px 2px 2px rgba(0,0,0,0.3))"
        />
      </g>

      {/* Gradients and filters */}
      <defs>
        <linearGradient id="centerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFCDD2" />
          <stop offset="100%" stopColor="#F8BBD0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
