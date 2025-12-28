import { useLayoutEffect, useRef, useState } from "react"
import type { Rect } from "@wireframes/lib/resizable-layout"

export function useContainerRect() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)

  useLayoutEffect(() => {
    if (!ref.current) return

    const measure = () => {
      const r = ref.current!.getBoundingClientRect()
      setRect({
        x: 0,
        y: 0,
        width: r.width,
        height: r.height,
      })
    }
    const id = requestAnimationFrame(measure)

    measure()

    const ro = new ResizeObserver(measure)
    ro.observe(ref.current)

    return (): void => {
      ro.disconnect()
      cancelAnimationFrame(id)
    }
  }, [])

  return { ref, rect }
}
