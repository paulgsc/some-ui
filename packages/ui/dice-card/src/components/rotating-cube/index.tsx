import type { FC } from "react"
import { useMemo } from "react"
import { DiceCard } from "@dice-card/components/dice-card"
import type {
  AllowedRotationAxis,
  Mode,
} from "@dice-card/hooks/use-rotating-cube"
import { processArray } from "@dice-card/utils/rotating-cube"

export type RotatingCubeProps = {
  perspective?: number
  dof?: AllowedRotationAxis
  mode?: Mode
  className?: string
  content?: Array<React.JSX.Element>
  duration?: number
  hideBackface?: boolean
  pauseOnInteraction?: boolean
}

export const RotatingCube: FC<RotatingCubeProps> = ({
  perspective = 1200,
  dof = "Y-axis",
  mode = "autoplay",
  content = [],
  duration = 3000,
  hideBackface = false,
  pauseOnInteraction = true,
  className,
}) => {
  // Use useMemo instead of useCallback for static/prop-driven data processing
  const faces = useMemo(() => {
    return processArray(content, 4)
  }, [content])

  return (
    <DiceCard
      className={className}
      dof={dof}
      mode={mode}
      faces={faces}
      perspective={perspective}
      duration={duration}
      hideBackface={hideBackface}
      pauseOnInteraction={pauseOnInteraction}
    />
  )
}
