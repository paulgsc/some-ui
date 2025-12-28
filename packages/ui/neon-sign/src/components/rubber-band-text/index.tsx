import type { FC } from "react"
import { useRubberBandAnimation } from "@neon-sign/hooks/use-rubber-band-text"
import { cn } from "some-ui-utils"

type TextDisplayProps = {
  text: string
  color: string
  shadowDepth: string
  overlap: number
  animationSpeed?: number
  dampingFactor?: number
  className?: string
}
export const TextDisplay: FC<TextDisplayProps> = ({
  text,
  overlap,
  color,
  shadowDepth,
  animationSpeed = 1,
  dampingFactor = 1,
  className,
}) => {
  const { charPositions } = useRubberBandAnimation({
    text,
    overlap,
    animationSpeed,
    dampingFactor,
  })
  return (
    <svg
      width="100%"
      height="200"
      viewBox="0 0 600 120"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("", className)}
    >
      {text.split("").map((char, index) => (
        <g key={index} style={{ isolation: "isolate" }}>
          <text
            x={charPositions[index]?.x}
            y="100"
            fontSize="100"
            fontWeight="bold"
            fill="rgba(0,0,0,0.2)"
            style={{ transform: `translateY(${shadowDepth}px)` }}
          >
            {char}
          </text>
          <text
            x={charPositions[index]?.x}
            y="100"
            fontSize="100"
            fontWeight="bold"
            fill={color}
          >
            {char}
          </text>
        </g>
      ))}
    </svg>
  )
}
