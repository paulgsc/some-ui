import type { FC } from "react"
import { useEffect } from "react"
import { CrosswordCellSvg } from "@input/components/crossword-cell"
import { useCrosswordWithAnimation } from "@input/hooks/use-create-crossword-puzzle"
import { useCreateCrosswordWasm } from "@input/hooks/use-crossword-wasm"
import { cn } from "some-ui-utils"

import "./index.css"

type CrosswordGridSvgProps = {
  className?: string
  duration?: number
  delay?: number
  autoplayOnMount?: boolean
  repeat?: boolean
  onAnimationComplete?: () => void
}
export const CrosswordGridSvg: FC<CrosswordGridSvgProps> = ({
  onAnimationComplete,
  className,
  duration = 3 * 1000,
}): React.JSX.Element => {
  const cellSize = 30
  const { crossword } = useCreateCrosswordWasm()
  const { grid, viewBox, isAnimating, completionPercentage } =
    useCrosswordWithAnimation(crossword?.wordPlacements ?? [], duration)

  useEffect(() => {
    if (completionPercentage === 100 && onAnimationComplete && !isAnimating) {
      onAnimationComplete()
    }
  }, [completionPercentage, isAnimating, onAnimationComplete])

  return (
    <div
      className={cn(
        "relative size-full bg-cover bg-center bg-no-repeat",
        "bg-gradient-to-br from-[oklch(30%_0.2_330deg)] via-[oklch(50%_0.3_320deg)] to-[oklch(70%_0.25_350deg)]",
        "bg-[url('http://nixos.local:3000/gdrive/image/1A1rrlrnxlZTuelEygg1iUCW8fR_Bw6cL')]",
        className
      )}
    >
      <svg viewBox={viewBox.join(" ")} className="size-full">
        <g>
          {grid.map((cell) => {
            const cellId = `${cell.x}-${cell.y}`
            return (
              <CrosswordCellSvg key={cellId} cell={cell} cellSize={cellSize} />
            )
          })}
        </g>
      </svg>
    </div>
  )
}
