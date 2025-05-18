import type { CSSProperties, FC, RefObject } from "react"
import { useRef } from "react"
import type { AllowedRotationAxis } from "@slideshow/hooks/use-rotating-cube"
import { cn, useMeasureRect } from "some-ui-utils"

type RotatingCubeProps = {
  perspective?: number
  rotationAxis?: AllowedRotationAxis
  className?: string
}

export const SugarCube: FC<RotatingCubeProps> = ({
  className,
  perspective = 1200,
  rotationAxis = "X-Axis",
}): React.JSX.Element => {
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
            "--cube-x-rotation": -20,
            "--cube-y-rotation": 45,
          } as CSSProperties
        }
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            style={
              {
                "--face-width": (width ?? 0) / 2,
                "--face-height": (height ?? 0) / 2,
                "--face-depth": Math.min(width ?? 0, height ?? 0) / 2,
              } as CSSProperties
            }
            className={cn(
              "absolute z-10 flex size-full items-center justify-center rounded-lg shadow-inner transition-colors",
              "backface-visible",
              "bg-muted",
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
              }
            )}
          ></div>
        ))}
      </div>
    </div>
  )
}
