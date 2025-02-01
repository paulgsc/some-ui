import { useCallback, useEffect, useRef, useState } from "react"
import type { ImperativePanelHandle } from "some-ui-shared"

type ExpandedPanel = {
  row: number
  col: number
}

type UpdatePanelSizeOptions = {
  rowsRef: Array<ImperativePanelHandle | null>
  colsRef: Array<ImperativePanelHandle | null>
}

type RandomExpansion = {
  updatePanelSize: (options: UpdatePanelSizeOptions) => void
  expandedPanel: ExpandedPanel | null
}

export const useRandomPanelExpansion = (
  rows: number,
  cols: number,
  interval = 30000,
  animationDuration = 30000
): RandomExpansion => {
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel | null>(null)
  const [animationProgress, setAnimationProgress] = useState(0)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  const updatePanelSize = useCallback(
    ({ rowsRef, colsRef }: UpdatePanelSizeOptions): void => {
      const resizePanels = (
        panelRefs: Array<ImperativePanelHandle | null>,
        isRow: boolean
      ) => {
        if (!expandedPanel) return
        const initialSize = isRow ? 100 / rows : 100 / cols
        for (const ref of panelRefs) {
          const expandedRef = isRow
            ? panelRefs[expandedPanel.row]
            : panelRefs[expandedPanel.col]
          if (!expandedRef || !ref) return
          const size =
            ref.getId() === expandedRef.getId()
              ? Math.min(
                  100,
                  initialSize + animationProgress * (100 - initialSize)
                )
              : Math.max(0, initialSize * (1 - animationProgress))
          ref.resize(size)
        }
      }

      resizePanels(rowsRef, true)
      resizePanels(colsRef, false)
    },
    [rows, cols, expandedPanel, animationProgress]
  )

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
