import { useLayoutEffect } from "react"
import type { JSX, ReactNode } from "react"
import { extractRegionRects } from "@wireframes/lib/extract-rects"
import type { SolvedNode } from "@wireframes/lib/layout-types"
import { useRegionRectStore } from "some-ui-utils"

type LayoutRectPublisherProps<T extends string> = {
  /** The solved layout tree */
  layout: SolvedNode<T>
  /** Children to render (typically RenderSolved) */
  children: ReactNode
}

/**
 * Publishes region rects to the global store whenever layout changes
 * This is the ONLY place where rects should be written to the store
 */
export const LayoutRectPublisher = <T extends string>({
  layout,
  children,
}: LayoutRectPublisherProps<T>): JSX.Element => {
  const setRects = useRegionRectStore((s) => s.setRects)

  useLayoutEffect(() => {
    const rects = extractRegionRects(layout)
    setRects(rects)
  }, [layout, setRects])

  return <>{children}</>
}
