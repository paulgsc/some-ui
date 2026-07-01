import { useEffect, useState } from "react"
import type {
  GridDimensions,
  ViewportDimensions,
} from "@nfl/types/hopium/hopium-tracker"
import { calculateGridDimensions } from "@nfl/utils/hopium/monitor-utils"

export function useViewport(): {
  viewportSize: ViewportDimensions
  gridDimensions: GridDimensions
} {
  const [viewportSize, setViewportSize] = useState<ViewportDimensions>({
    width: 0,
    height: 0,
  })

  useEffect((): (() => void) => {
    const updateViewportSize = (): void => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    updateViewportSize()
    window.addEventListener("resize", updateViewportSize)
    return () => window.removeEventListener("resize", updateViewportSize)
  }, [])

  const gridDimensions: GridDimensions = calculateGridDimensions(viewportSize)

  return {
    viewportSize,
    gridDimensions,
  }
}
