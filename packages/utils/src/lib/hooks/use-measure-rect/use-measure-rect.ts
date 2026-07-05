import type { RefObject } from "react"
import { useResizeObserver } from "@utils/lib/hooks/use-resize-observer"

// Define the Rect type
export type Rect<T extends Element> = {
  size: Size
  options: Options<T>
}

type Size = {
  width: number | undefined

  height: number | undefined
}

type Options<T extends Element> = {
  ref: RefObject<T | null>
  onResize?: (size: Size) => void
  box?: "border-box" | "content-box" | "device-pixel-content-box"
}

// Hook to measure the size of an element using useResizeObserver
export function useMeasureRect<T extends Element>(options: Options<T>): Size {
  const { height, width } = useResizeObserver({
    ...options,
  })

  return { height, width }
}
