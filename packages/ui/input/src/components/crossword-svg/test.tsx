import type { FC } from "react"
import { useTypewriterAnimation } from "@input/hooks/use-typewriter-animation"
import type { CrosswordCell } from "@input/lib/crossword-grid"

type CrosswordCellSvgProps = {
  cell: CrosswordCell
  cellSize: number
}

export const CrosswordCellSvg: FC<CrosswordCellSvgProps> = ({
  cell,
  cellSize,
}) => {
  const solved = false
  const x = cell.x * cellSize
  const y = cell.y * cellSize
  const centerX = cell.x * cellSize + cellSize / 2
  const centerY = cell.y * cellSize + cellSize / 2
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
    <g
      ref={setRef}
      onClick={() => {
        startAnimation()
      }}
    >
      {/* Cell rectangle */}
      <rect
        x={x}
        y={y}
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

      {/* Cell number */}
      {cell.num && (
        <text
          x={x + 2}
          y={y + 8}
          fontSize="8"
          textAnchor="start"
          fontWeight={"normal"}
          fill={"black"}
        >
          {cell.num}
        </text>
      )}
      <text
        x={centerX}
        y={centerY}
        fontSize="16"
        fontWeight="bold"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={isValid || solved ? "#2E7D32" : isAnimating ? "#C62828" : "black"}
      >
        {currentLetter}
      </text>
    </g>
  )
}
