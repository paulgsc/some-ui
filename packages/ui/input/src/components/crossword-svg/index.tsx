import type { FC } from "react"
import { useEffect, useRef } from "react"
import { CrosswordCellSvg } from "@input/components/crossword-cell"
import { useCrosswordWithAnimation } from "@input/hooks/use-create-crossword-puzzle"
import { useCreateCrosswordWasm } from "@input/hooks/use-crossword-wasm"
import { cn } from "some-ui-utils"

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
  autoplayOnMount = true,
  repeat = false,
  duration = 3 * 60 * 1000,
}): React.JSX.Element => {
  const cellSize = 30
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)
  const { crossword } = useCreateCrosswordWasm()
  const {
    grid,
    viewBox,
    isAnimating,
    completionPercentage,
    startAnimation,
    stopAnimation,
    resetCrossword,
  } = useCrosswordWithAnimation(crossword?.word_placements ?? [], duration)

  useEffect(() => {
    if (completionPercentage === 100 && onAnimationComplete && !isAnimating) {
      onAnimationComplete()
    }
  }, [completionPercentage, isAnimating, onAnimationComplete])

  useEffect(() => {
    if (autoplayOnMount) {
      if (!repeat) {
        timerRef.current = setTimeout(() => {
          startAnimation()
        }, 100)
      } else {
        intervalRef.current = setInterval(
          () => {
            stopAnimation()
            resetCrossword()
            startAnimation()
          },
          Math.min(duration * 2, 5 * 60 * 1000)
        )
      }
    }
    return (): void => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (intervalRef.current) clearTimeout(intervalRef.current)
      stopAnimation()
    }
  }, [
    repeat,
    resetCrossword,
    duration,
    autoplayOnMount,
    startAnimation,
    stopAnimation,
  ])

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
