import { useCallback, useEffect, useRef, useState } from "react"
import type { ImperativePanelHandle } from "some-ui-shared"

type ExpandedPanel = {
  row: number
  col: number
}

type RandomExpansion = {
  updatePanelSize: (
    index: number,
    isRow: boolean,
    ref: ImperativePanelHandle | null
  ) => void
  expandedPanel: ExpandedPanel | null
}

export const useRandomPanelExpansion = (
  rows: number,
  cols: number,
  interval = 5000,
  animationDuration = 5000
): RandomExpansion => {
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel | null>(null)
  const [animationProgress, setAnimationProgress] = useState(0)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  function updatePanelSize(
    index: number,
    isRow: boolean,
    ref: ImperativePanelHandle | null
  ): void {
    if (!ref) return
    const initialSize = isRow ? 100 / rows : 100 / cols
    const expandedIndex = isRow ? expandedPanel?.row : expandedPanel?.col
    const size =
      expandedIndex === index
        ? // eslint-disable-next-line no-mixed-operators
          Math.min(100, initialSize + animationProgress * (100 - initialSize))
        : Math.max(0, initialSize * (1 - animationProgress))
    ref.resize(size)
  }

  const selectRandomPanel = useCallback(() => {
    const row = Math.floor(Math.random() * rows)
    const col = Math.floor(Math.random() * cols)
    setExpandedPanel({ row, col })
    setAnimationProgress(0)
  }, [rows, cols])

  const startAnimation = useCallback(() => {
    const startTime = Date.now()

    const animate = (): void => {
      const elapsedTime = Date.now() - startTime
      const progress = Math.min(elapsedTime / animationDuration, 1)
      setAnimationProgress(progress)

      if (progress < 1) {
        // Store the animation frame ID for cleanup
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        // Schedule next panel selection
        timeoutRef.current = setTimeout(() => {
          selectRandomPanel()
          startAnimation()
        }, interval - animationDuration)
      }
    }

    // Cancel any existing animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    // Start the animation
    animationFrameRef.current = requestAnimationFrame(animate)
  }, [interval, animationDuration, selectRandomPanel])

  useEffect(() => {
    // Start initial animation
    selectRandomPanel()
    startAnimation()

    // Cleanup function
    return (): void => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      clearTimeout(timeoutRef.current)
    }
  }, [selectRandomPanel, startAnimation])

  return { expandedPanel, updatePanelSize }
}
