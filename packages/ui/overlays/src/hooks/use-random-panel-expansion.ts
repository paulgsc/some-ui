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

type UseRandomExpansionOptions = {
  rows: number
  cols: number
  interval?: number
  animationDuration?: number
  replay?: boolean | (() => boolean)
  callback?: () => void
  onSuccess?: () => void
}

type RandomExpansion = {
  updatePanelSize: (options: UpdatePanelSizeOptions) => void
  expandedPanel: ExpandedPanel | null
  pauseAnimation: () => void
  resumeAnimation: () => void
}

export const useRandomPanelExpansion = ({
  rows,
  cols,
  interval = 15000,
  animationDuration = 5000,
  replay = false,
  callback,
  onSuccess,
}: UseRandomExpansionOptions): RandomExpansion => {
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel | null>(null)
  const [animationProgress, setAnimationProgress] = useState(0)
  const [isPaused, setIsPaused] = useState<boolean>(false)

  const animationFrameRef = useRef<number | undefined>(undefined)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  const startTimeRef = useRef<number>(0)
  const pausedTimeRef = useRef<number>(0)

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

  const shouldReplay = (): boolean => {
    switch (typeof replay) {
      case "boolean":
        return replay
      case "function":
        return replay()
      default:
        throw new Error(`Unexpected typeof replay: ${typeof replay}`)
    }
  }

  const startAnimation = useCallback(() => {
    if (callback) callback()
    const startTime = Date.now()

    const animate = (): void => {
      if (isPaused) {
        pausedTimeRef.current = Date.now()
        return
      }

      const elapsedTime = Date.now() - startTime
      const progress = Math.min(elapsedTime / animationDuration, 1)
      setAnimationProgress(progress)

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        if (onSuccess) onSuccess()

        if (shouldReplay()) {
          timeoutRef.current = setTimeout(() => {
            selectRandomPanel()
            startAnimation()
          }, interval - animationDuration)
        }
      }
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [interval, replay, animationDuration, selectRandomPanel])

  const pauseAnimation = useCallback(() => {
    setIsPaused(true)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }, [])

  const resumeAnimation = useCallback(() => {
    setIsPaused(false)
    if (pausedTimeRef.current) {
      // Adjust start time to account for pause duration
      const pauseDuration = Date.now() - pausedTimeRef.current
      startTimeRef.current += pauseDuration
      pausedTimeRef.current = 0
    }
    startAnimation()
  }, [startAnimation])

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

  return { expandedPanel, updatePanelSize, pauseAnimation, resumeAnimation }
}
