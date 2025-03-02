import type { CSSProperties } from "react"
import { useAperture } from "@slideshow/hooks/use-aperture"
import { cn } from "some-ui-utils"

export const LensShutter = (): React.JSX.Element => {
  const { topX, rightX, leftX, rightY, leftY, apertureSize, apertureRotation } =
    useAperture()
  const clipPath = `polygon(
          ${topX}% 0%,
              ${rightX}% ${rightY}%,
                  ${rightX}% ${100 - rightY}%,
                      ${topX}% 100%,
                          ${leftX}% ${100 - leftY}%,
                              ${leftX}% ${leftY}%
                                )`
  return (
    <div className="size-200 transform-3d perspective-[1250px] border border-gray-950">
      <div className="inset-shadow-lg inset-shadow-red-700 ring-10 relative flex size-96 items-center justify-center rounded-full ring-gray-800">
        <div className="-translate-z-10 absolute inset-0 z-0 rounded-full border-4 border-white bg-gray-950" />
        <div
          style={
            {
              "--aperture-size": apertureSize,
              "--top-x": topX,
              "--right-x": rightX,
              "--right-y": rightY,
              "--left-x": leftX,
              "--left-y": leftY,
              "--aperture-rotation": apertureRotation,
              clipPath,
            } as CSSProperties
          }
          className={cn(
            "z-10 size-[calc(var(--aperture-size)*1%)] rounded-full border-4 border-white bg-white",
            "duration-2000 rotate-[calc(var(--aperture-rotation)*1deg)] transition-all ease-in-out"
          )}
        />
      </div>
    </div>
  )
}
