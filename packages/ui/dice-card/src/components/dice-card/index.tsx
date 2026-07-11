import type { CSSProperties, FC, ReactNode } from "react"
import { useRef } from "react"
import type {
  AllowedRotationAxis,
  Mode,
} from "@dice-card/hooks/use-rotating-cube"
import { useRotatingCube } from "@dice-card/hooks/use-rotating-cube"
import { BorderBeam } from "some-ui-shared"
import { cn, useMeasureRect } from "some-ui-utils"

type RotatingCubeProps = {
  perspective?: number
  faces?: Array<ReactNode>
  dof?: AllowedRotationAxis
  mode?: Mode
  duration?: number
  className?: string
  faceClassName?: string
  showBeam?: boolean
  cubeId?: number | string
  hideBackface?: boolean
}

export const DiceCard: FC<RotatingCubeProps> = ({
  className,
  faceClassName,
  cubeId,
  mode = "autoplay",
  perspective = 1200,
  dof = "Y-axis",
  duration = 10000,
  faces = [],
  showBeam = true,
  hideBackface = false,
}): React.JSX.Element => {
  const { rotationState, rotationAxis } = useRotatingCube({
    dof,
    duration,
    mode,
    cubeId,
  })
  const ref = useRef<HTMLDivElement>(null)

  const { height, width } = useMeasureRect({ ref })

  return (
    <div
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      style={{ "--perspective": perspective } as CSSProperties}
      className={cn(
        "flex size-10/12 items-center justify-center [perspective:calc(var(--perspective)*1px)]",
        "bg-transparent",
        className
      )}
    >
      <div
        ref={ref}
        className={cn(
          "bg-transparent",
          "transform-3d relative size-full transition-transform duration-500",
          "[transform:rotateX(calc(var(--cube-x-rotation)*1deg))_rotateY(calc(var(--cube-y-rotation)*1deg))]"
        )}
        style={
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          {
            "--cube-x-rotation": rotationState.xRotation,
            "--cube-y-rotation": rotationState.yRotation,
          } as CSSProperties
        }
      >
        {faces.map((face, index) => (
          <div
            key={index}
            style={
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
              {
                "--face-width": (width ?? 0) / 2,
                "--face-height": (height ?? 0) / 2,
                "--face-depth": Math.min(width ?? 0, height ?? 0) / 2,
              } as CSSProperties
            }
            className={cn(
              "absolute bg-transparent z-10 flex size-full items-center justify-center rounded-lg shadow-inner transition-colors",
              faceClassName,
              {
                "[transform:translateZ(calc(var(--face-width)*1px))]":
                  index === 0,
                "[transform:translateZ(calc(var(--face-depth)*1px))]":
                  index === 0 && rotationAxis === "X-axis",
                "[transform:rotateY(90deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 1,
                "[transform:rotateY(180deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 2 && rotationAxis === "Y-axis",
                "[transform:rotateY(180deg)_rotateZ(180deg)_translateZ(calc(var(--face-depth)*1px))]":
                  index === 2 && rotationAxis === "X-axis",
                "[transform:rotateY(-90deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 3,
                "[transform:rotateX(90deg)_translateZ(calc(var(--face-height)*1px))]":
                  index === 4,
                "[transform:rotateX(-90deg)_translateZ(calc(var(--face-height)*1px))]":
                  index === 5,
                invisible:
                  (index === 1 || index === 3) &&
                  width !== height &&
                  rotationAxis === "X-axis",
                "backface-hidden": hideBackface,
              }
            )}
          >
            {showBeam && mode !== "manual" && rotationState.face === index && (
              <BorderBeam
                size={16}
                duration={duration / 1000}
                color={"#333333"}
                showTrail={true}
                trailColorStart={"#ffaa40"}
                trailColorEnd={"#9c40ff"}
                trailWidth={1}
                trailOpacity={0.5}
                trailFadeDuration={duration / 2}
              />
            )}
            {face}
          </div>
        ))}
      </div>
    </div>
  )
}
