import type { CSSProperties, FC, RefObject } from "react"
import { ReactNode, useRef } from "react"
import {
  AllowedRotationAxis,
  useRotatingCube,
} from "@slideshow/hooks/use-rotating-cube"
import { cn, useMeasureRect } from "some-ui-utils"

type RotatingCubeProps = {
  perspective?: number
  faces?: Array<ReactNode>
  dof?: AllowedRotationAxis
  className?: string
  faceClassName?: string
}

export const DiceCard: FC<RotatingCubeProps> = ({
  className,
  faceClassName,
  perspective = 1200,
  dof = "Y-axis",
  faces = [],
}): React.JSX.Element => {
  const { isRotating, setIsRotating, rotationState, rotationAxis } =
    useRotatingCube({
      dof,
    })
  const ref = useRef<HTMLDivElement>(null)

  const { height, width } = useMeasureRect({
    ref: ref as RefObject<HTMLElement>,
  })

  return (
    <div
      style={{ "--perspective": perspective } as CSSProperties}
      className={cn(
        "flex size-10/12 items-center justify-center [perspective:calc(var(--perspective)*1px)]",
        className
      )}
    >
      <div
        ref={ref}
        className={cn(
          "transform-3d relative size-full transition-transform duration-500",
          "[transform:rotateX(calc(var(--cube-x-rotation)*1deg))_rotateY(calc(var(--cube-y-rotation)*1deg))]"
        )}
        style={
          {
            "--cube-x-rotation": rotationState.xRotation,
            "--cube-y-rotation": rotationState.yRotation,
          } as CSSProperties
        }
        onMouseEnter={() => setIsRotating(false)}
        onMouseLeave={() => setIsRotating(true)}
      >
        {faces.map((face, index) => (
          <div
            key={index}
            style={
              {
                "--face-width": (width ?? 0) / 2,
                "--face-height": (height ?? 0) / 2,
                "--face-depth": (Math.min(width ?? 0, height ?? 0) ?? 0) / 2,
              } as CSSProperties
            }
            className={cn(
              "absolute z-10 flex size-full items-center justify-center rounded-lg shadow-inner transition-colors",
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
                "backface-visible": isRotating,
              }
            )}
          >
            {face}
          </div>
        ))}
      </div>
    </div>
  )
}
