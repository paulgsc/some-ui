import type { FC } from "react"
import { useEffect, useRef } from "react"
import { CrosswordCellSvg } from "@input/components/crossword-cell"
import { useCrosswordWithAnimation } from "@input/hooks/use-create-crossword-puzzle"
import { useCreateCrosswordWasm } from "@input/hooks/use-crossword-wasm"
import { cn } from "some-ui-utils"

type CrosswordGridSvgProps = {
  words: Array<string>
  className?: string
  duration?: number
  delay?: number
  autoplayOnMount?: boolean
  repeat?: boolean
  onAnimationComplete?: () => void
}
export const CrosswordGridSvg: FC<CrosswordGridSvgProps> = ({
  words,
  onAnimationComplete,
  className,
  autoplayOnMount = true,
  repeat = false,
  duration = 3 * 60 * 1000,
}): React.JSX.Element => {
  const cellSize = 30
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)
  const { crossword } = useCreateCrosswordWasm(words)
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
    <svg viewBox={viewBox} className={cn("size-full", className)}>
      <g>
        {grid.map((cell) => {
          const cellId = `${cell.x}-${cell.y}`
          return (
            <CrosswordCellSvg key={cellId} cell={cell} cellSize={cellSize} />
          )
        })}
      </g>
    </svg>
  )
}
