import type { RefObject } from "react"
import type { DialSection } from "@slideshow/types/dial"
import {
  generateSectionPath,
  getSectionTextPosition,
} from "@slideshow/utils/dial-utils"

import { DialSectionComponent } from "./DialSection"

type DialSVGProps = {
  sections: Array<DialSection>
  sectionBoundaries: Array<{ startAngle: number; endAngle: number }>
  currentAngle: number
  currentSection: DialSection
  svgRef: RefObject<SVGSVGElement>
  isDragging: boolean
  isHovering: boolean
  handlePointerMouseDown: (e: React.MouseEvent) => void
  setZoomedSection: (index: number | null) => void
  zoomedSection: number | null
}

export const DialSVG = ({
  sections,
  sectionBoundaries,
  currentAngle,
  currentSection,
  svgRef,
  isDragging,
  isHovering,
  handlePointerMouseDown,
  setZoomedSection,
  zoomedSection,
}: DialSVGProps) => {
  // Generate SVG paths for each section

  // Calculate pointer position
  const pointerAngleRadians = (currentAngle - 90) * (Math.PI / 180)
  const pointerX = 100 + 70 * Math.cos(pointerAngleRadians)
  const pointerY = 100 + 70 * Math.sin(pointerAngleRadians)

  return (
    <svg width="200" height="200" viewBox="0 0 200 200" ref={svgRef}>
      {/* Outer ring with 3D effect */}
      <circle
        cx="100"
        cy="100"
        r="80"
        fill="none"
        stroke="#333"
        strokeWidth="1"
      />
      <circle
        cx="100"
        cy="100"
        r="80"
        fill="none"
        stroke="rgba(255,255,255,0.8)"
        strokeWidth="2"
        filter="drop-shadow(0px 2px 3px rgba(0,0,0,0.2))"
      />

      {/* Dial sections */}
      <g>
        {sections.map((section, index) => {
          const { startAngle, endAngle } = sectionBoundaries[index]
          const path = generateSectionPath(startAngle, endAngle, 40, 80)
          const isZoomed = zoomedSection === index
          const textPos = getSectionTextPosition(index, sectionBoundaries)

          return (
            <DialSectionComponent
              key={section.id}
              section={section}
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
        const x1 = 100 + 40 * Math.cos(radians)
        const y1 = 100 + 40 * Math.sin(radians)
        const x2 = 100 + 80 * Math.cos(radians)
        const y2 = 100 + 80 * Math.sin(radians)

        return (
          <line
            key={index}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#333"
            strokeWidth="1"
          />
        )
      })}

      {/* Center circle with 3D effect */}
      <circle
        cx="100"
        cy="100"
        r="40"
        fill="#FFC0CB"
        filter="drop-shadow(0px 3px 5px rgba(0,0,0,0.2))"
      />
      <circle
        cx="100"
        cy="100"
        r="40"
        fill="url(#centerGradient)"
        filter="drop-shadow(0px 3px 5px rgba(0,0,0,0.2))"
      />

      {/* Pointer */}
      <g
        transform={`rotate(${currentAngle}, 100, 100)`}
        onMouseDown={handlePointerMouseDown}
        style={{ cursor: "grab" }}
      >
        <polygon
          points="100,30 110,50 90,50"
          fill={isDragging ? "#FF5555" : "#FF7F7F"}
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
