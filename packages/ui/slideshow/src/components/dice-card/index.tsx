import type { CSSProperties, FC, RefObject } from "react"
import { ReactNode, useRef } from "react"
import { useRotatingCube } from "@slideshow/hooks/use-rotating-cube"
import { cn, useMeasureRect } from "some-ui-utils"

type RotatingCubeProps = {
  perspective?: number
  faces?: Array<ReactNode>
  className?: string
}

export const DiceCard: FC<RotatingCubeProps> = ({
  className,
  perspective = 1200,
  faces = [],
}): React.JSX.Element => {
  const { rotationAxis, isRotating, setIsRotating, rotationState } =
    useRotatingCube({
      dof: "All",
    })
  console.log(rotationAxis, rotationState)
  const ref = useRef<HTMLDivElement>(null)

  const { width } = useMeasureRect({
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
          "transform-3d relative size-full max-w-sm transition-transform duration-500",
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
            style={{ "--face-width": (width ?? 0) / 2 } as CSSProperties}
            className={cn(
              "backface-visible absolute z-10 flex size-full items-center justify-center rounded-lg shadow-inner transition-colors",
              {
                "[transform:rotateY(0deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 0,
                "[transform:rotateY(90deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 1,
                "[transform:rotateY(180deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 2,
                "[transform:rotateY(-90deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 3,
                "[transform:rotateX(90deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 4,
                "[transform:rotateX(-90deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 5,

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
