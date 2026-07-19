import type { MouseEvent as ReactMouseEvent, RefObject } from "react"
import { useCallback, useEffect, useRef, useState } from "react"

type SectionConstraint = {
  id: string | number
}

type UseDialDragProps<T extends SectionConstraint> = {
  setCurrentAngle: (angle: number) => void
  getCurrentSection: (angle: number) => T
  setCurrentSection: (section: T) => void
}

export function useDialDrag<T extends SectionConstraint>({
  setCurrentAngle,
  getCurrentSection,
  setCurrentSection,
}: UseDialDragProps<T>): {
  isDragging: boolean
  svgRef: RefObject<SVGSVGElement | null>
  handlePointerMouseDown: (e: ReactMouseEvent<SVGSVGElement>) => void
} {
  const [isDragging, setIsDragging] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)

  // Anchor operational callbacks to mutable refs to prevent constant event listener cycles
  const handlersRef = useRef({
    setCurrentAngle,
    getCurrentSection,
    setCurrentSection,
  })
  useEffect(() => {
    handlersRef.current = {
      setCurrentAngle,
      getCurrentSection,
      setCurrentSection,
    }
  }, [setCurrentAngle, getCurrentSection, setCurrentSection])

  // Capture mouse up and mouse move events exclusively at the DOM boundary
  useEffect(() => {
    if (!isDragging) {
      return
    }

    const handleMouseMove = (e: MouseEvent): void => {
      const svg = svgRef.current
      if (!svg) {
        return
      }

      const svgRect = svg.getBoundingClientRect()
      const centerX = svgRect.left + svgRect.width / 2
      const centerY = svgRect.top + svgRect.height / 2

      // Compute angle relative to layout origin
      const dx = e.clientX - centerX
      const dy = e.clientY - centerY
      const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90

      // Normalize layout angle to complete 360 unit ring
      const normalizedAngle = angle < 0 ? angle + 360 : angle
      handlersRef.current.setCurrentAngle(normalizedAngle)

      // Safely validate target sections through non-any identifier checks
      const nextSection = handlersRef.current.getCurrentSection(normalizedAngle)
      const activeSection =
        handlersRef.current.getCurrentSection(normalizedAngle)

      if (nextSection.id !== activeSection.id) {
        handlersRef.current.setCurrentSection(nextSection)
      }
    }

    const handleMouseUp = (): void => {
      setIsDragging(false)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return (): void => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

  // Synchronous handler acts purely as the interaction entry point
  const handlePointerMouseDown = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>): void => {
      e.preventDefault()
      setIsDragging(true)
    },
    []
  )

  return {
    isDragging,
    svgRef,
    handlePointerMouseDown,
  }
}
