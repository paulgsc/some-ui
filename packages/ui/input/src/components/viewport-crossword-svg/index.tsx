import type { ComponentProps, FC } from "react"
import { CrosswordGridSvg } from "@input/components/crossword-svg"
import { useViewportManager } from "@input/hooks/use-viewport-rotation-wasm"

type ViewportCrosswordGridProps = ComponentProps<typeof CrosswordGridSvg>

export const ViewportCrosswordGrid: FC<ViewportCrosswordGridProps> = (
  props
) => {
  const { isLoading, error } = useViewportManager({
    maxPerFace: 3,
  })

  if (isLoading) return <div>Loading viewports...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <CrosswordGridSvg
      duration={10 * 1000}
      className="absolute inset-0"
      {...props}
    />
  )
}
