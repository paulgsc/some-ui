import type { FC } from "react"
import { useTypewriterAnimation } from "@input/hooks/use-typewriter-animation"
import type { CrosswordCell } from "@input/lib/crossword-grid"

type CrosswordGridSvgProps = {
  className?: string
  cell: CrosswordCell
}
export const CrosswordCellSvg: FC<CrosswordGridSvgProps> = ({
  cell,
}): React.JSX.Element => {
  const cellSize = 30
  const { x, y, num } = cell
  const solved = false

  const {
    currentLetter,
    isAnimating,
    isValid,
    isVibrating,
    isHighlighted,
    startAnimation,
    setRef,
  } = useTypewriterAnimation({
    validLetter: "L",
    onComplete: () => {},
  })

  return (
    <>
      {/* Cell rectangle */}
      <rect
        x="0"
        y="0"
        width={cellSize}
        height={cellSize}
        fill={
          isValid || solved
            ? "#E8F5E9"
            : isAnimating && currentLetter
              ? "#FFEBEE"
              : "white"
        }
        stroke={
          isHighlighted
            ? "#29B6F6"
            : isValid || solved
              ? "#4CAF50"
              : isAnimating && currentLetter
                ? "#F44336"
                : "black"
        }
        strokeWidth={
          isHighlighted || isValid || solved || (isAnimating && currentLetter)
            ? "2"
            : "1"
        }
      />

      {/* Cell number (if provided) */}
      {num && (
        <text
          x="2"
          y="8"
          fontSize="8"
          textAnchor="start"
          fontWeight="normal"
          fill="black"
        >
          {num}
        </text>
      )}

      {/* Letter text */}
      {(currentLetter || solved) && (
        <text
          x={cellSize / 2}
          y={cellSize / 2 + 2}
          fontSize="16"
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight="bold"
          fill={
            isValid || solved ? "#2E7D32" : isAnimating ? "#C62828" : "black"
          }
        >
          {solved ? letter : currentLetter}
        </text>
      )}
    </>
  )
}
