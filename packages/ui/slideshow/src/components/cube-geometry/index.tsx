import type { FC, JSX, ReactNode } from "react"
import { cn, useContainerRect } from "some-ui-utils"

export type CubeGeometryProps = {
  perspective?: number
  xRotation: number
  yRotation: number
  hideBackface?: boolean
  className?: string
  faceClassName?: string
  faces: Array<{
    key: number | string
    content: ReactNode
  }>
}

export const CubeGeometry: FC<CubeGeometryProps> = ({
  perspective = 1200,
  xRotation,
  yRotation,
  faces,
  className,
  faceClassName,
  hideBackface = false,
}): JSX.Element => {
  const { rect, ref } = useContainerRect()
  if (!rect) return <div ref={ref} className="size-full" />

  const { width, height } = rect

  return (
    <div
      ref={ref}
      style={{ "--perspective": perspective }}
      className={cn(
        "flex size-full items-center justify-center",
        "[perspective:calc(var(--perspective)*1px)]",
        className
      )}
    >
      <div
        className={cn(
          "relative size-full transform-3d transition-transform duration-500"
        )}
        style={{
          "--cube-x-rotation": xRotation,
          "--cube-y-rotation": yRotation,
          transform: `
              rotateX(calc(var(--cube-x-rotation) * 1deg))
              rotateY(calc(var(--cube-y-rotation) * 1deg))
            `,
        }}
      >
        {faces.map((face, index) => (
          <div
            key={face.key}
            style={{
              "--face-width": width / 2,
              "--face-height": height / 2,
              "--face-depth": Math.min(width, height) / 2,
            }}
            className={cn(
              "absolute size-full flex items-center justify-center rounded-lg",
              faceClassName,
              {
                "[transform:translateZ(calc(var(--face-depth)*1px))]":
                  index === 0,
                "[transform:rotateY(90deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 1,
                "[transform:rotateY(180deg)_translateZ(calc(var(--face-depth)*1px))]":
                  index === 2,
                "[transform:rotateY(-90deg)_translateZ(calc(var(--face-width)*1px))]":
                  index === 3,
                "[transform:rotateX(90deg)_translateZ(calc(var(--face-height)*1px))]":
                  index === 4,
                "[transform:rotateX(-90deg)_translateZ(calc(var(--face-height)*1px))]":
                  index === 5,
                "backface-hidden": hideBackface,
              }
            )}
          >
            {face.content}
          </div>
        ))}
      </div>
    </div>
  )
}
