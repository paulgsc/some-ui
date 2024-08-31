import type { RefObject } from "react"
import { useResizeObserver } from "@utils/lib/hooks"

// Define the Rect type
export type Rect<T extends HTMLElement> = {
  size: Size
  options: Options<T>
}

type Size = {
  width: number | undefined

  height: number | undefined
}

type Options<T extends HTMLElement> = {
  ref: RefObject<T>
  onResize?: (size: Size) => void
  box?: "border-box" | "content-box" | "device-pixel-content-box"
}

// Hook to measure the size of an element using useResizeObserver
export function useMeasureRect<T extends HTMLElement>(
  options: Options<T>
): Size {
  const { height, width } = useResizeObserver({
    ...options,
  })

  return { height, width }
}
