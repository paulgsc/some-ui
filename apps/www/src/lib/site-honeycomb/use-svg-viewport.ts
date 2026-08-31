import { useEffect, useState, type RefObject } from "react"

export type SvgViewport = {
  /** Screen-space (relative to the ref's own element) origin of SVG
   * user-unit (0, 0), and the uniform user-unit → CSS px scale. Derived
   * from the live `viewBox` and `getBoundingClientRect()` so it accounts
   * for `preserveAspectRatio="xMidYMid meet"` letterboxing the same way
   * the browser does. */
  left: number
  top: number
  scale: number
}

/**
 * Tracks the live SVG → screen coordinate mapping for the `<svg>` inside
 * `containerRef`, so a sibling HTML overlay can be positioned to line up
 * with a specific point in the grid's own coordinate space — see
 * focus-overlay.tsx. `HexGrid` doesn't expose this itself; it's derived by
 * reading the rendered element, since the mapping is otherwise only
 * knowable to `HexGrid`'s own internal fit/viewBox computation.
 */
export function useSvgViewport(
  containerRef: RefObject<HTMLElement | null>
): SvgViewport | null {
  const [viewport, setViewport] = useState<SvgViewport | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = (): void => {
      const svg = container.querySelector("svg")
      const containerRect = container.getBoundingClientRect()
      if (!svg) {
        setViewport(null)
        return
      }
      const viewBox = svg.viewBox.baseVal
      if (viewBox.width <= 0 || viewBox.height <= 0) {
        setViewport(null)
        return
      }
      const svgRect = svg.getBoundingClientRect()
      const scale = Math.min(
        svgRect.width / viewBox.width,
        svgRect.height / viewBox.height
      )
      const contentWidth = viewBox.width * scale
      const contentHeight = viewBox.height * scale
      const svgLeft = svgRect.left - containerRect.left
      const svgTop = svgRect.top - containerRect.top
      const offsetX = svgLeft + (svgRect.width - contentWidth) / 2
      const offsetY = svgTop + (svgRect.height - contentHeight) / 2

      setViewport({
        left: offsetX - viewBox.x * scale,
        top: offsetY - viewBox.y * scale,
        scale,
      })
    }

    measure()
    // ResizeObserver catches the container being resized; MutationObserver
    // catches the `<svg>` itself appearing once HexGrid finishes its own
    // async WASM load (that doesn't change the container's own size, which
    // is already fixed by the caller — see site-honeycomb.tsx).
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(container)
    const mutationObserver = new MutationObserver(measure)
    mutationObserver.observe(container, { childList: true, subtree: true })
    return (): void => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [containerRef])

  return viewport
}
