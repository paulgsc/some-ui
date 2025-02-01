import { useCallback, useEffect, useRef, useState } from "react"
import type { ImperativePanelHandle } from "some-ui-shared"

type ExpandedPanel = {
  row: number
  col: number
}

type UpdatePanelSizeOptions = {
  refs: Array<ImperativePanelHandle | null>
  dimension: "row" | "col"
}

type RandomExpansion = {
  updatePanelSize: (options: UpdatePanelSizeOptions) => void
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

  const updatePanelSize = useCallback(
    ({ refs, dimension }: UpdatePanelSizeOptions): void => {
      if (!expandedPanel) return

      const count = dimension === "row" ? rows : cols
      const initialSize = 100 / count
      const expandedIndex = expandedPanel[dimension]

      refs.forEach((ref, index) => {
        if (!ref) return
        const size =
          index === expandedIndex
            ? Math.min(
                100,
                initialSize + animationProgress * (100 - initialSize)
              )
            : Math.max(0, initialSize * (1 - animationProgress))
        ref.resize(size)
      })
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
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        timeoutRef.current = setTimeout(() => {
          selectRandomPanel()
          startAnimation()
        }, interval - animationDuration)
      }
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [interval, animationDuration, selectRandomPanel])

  useEffect(() => {
    selectRandomPanel()
    startAnimation()

    return (): void => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      clearTimeout(timeoutRef.current)
    }
  }, [selectRandomPanel, startAnimation])

  return { expandedPanel, updatePanelSize }
}
