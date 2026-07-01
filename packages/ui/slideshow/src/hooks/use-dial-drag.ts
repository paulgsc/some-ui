import type { RefObject } from "react"
import { useRef, useState } from "react"
import type React from "react"

type UseDialDragProps = {
  setCurrentAngle: (angle: number) => void
  getCurrentSection: (angle: number) => any
  setCurrentSection: (section: any) => void
}

export function useDialDrag({
  setCurrentAngle,
  getCurrentSection,
  setCurrentSection,
}: UseDialDragProps): {
  isDragging: boolean
  svgRef: RefObject<SVGSVGElement | null>
  handlePointerMouseDown: (e: React.MouseEvent) => void
} {
  const [isDragging, setIsDragging] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  // Handle pointer drag
  const handlePointerMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    setIsDragging(true)
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }

  const handleMouseMove = (e: MouseEvent): void => {
    if (!svgRef.current || !isDragging) return

    const svgRect = svgRef.current.getBoundingClientRect()
    const centerX = svgRect.left + svgRect.width / 2
    const centerY = svgRect.top + svgRect.height / 2

    // Calculate angle based on mouse position relative to center
    const dx = e.clientX - centerX
    const dy = e.clientY - centerY
    const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90

    // Normalize angle to 0-360
    const normalizedAngle = angle < 0 ? angle + 360 : angle
    setCurrentAngle(normalizedAngle)

    // Update current section
    const newSection = getCurrentSection(normalizedAngle)
    if (newSection.id !== getCurrentSection(normalizedAngle).id) {
      setCurrentSection(newSection)
    }
  }

  const handleMouseUp = (): void => {
    setIsDragging(false)
    document.removeEventListener("mousemove", handleMouseMove)
    document.removeEventListener("mouseup", handleMouseUp)
  }

  return {
    isDragging,
    svgRef,
    handlePointerMouseDown,
  }
}
