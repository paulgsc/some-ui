import { CSSProperties } from "react"
import { useAperture } from "@slideshow/hooks/use-aperture"
import { cn } from "some-ui-utils"

export const LensShutter = () => {
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
    <div className="size-200 border border-gray-950 transform-3d perspective-[1250px]">
      <div className="inset-shadow-lg inset-shadow-red-700 ring-10 ring-gray-800 relative size-96 rounded-full flex justify-center items-center">
        <div className="absolute inset-0 z-0 -translate-z-10 bg-gray-950 rounded-full border-4 border-white" />
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
            "rounded-full size-[calc(var(--aperture-size)*1%)] z-10 border-4 border-white bg-white",
            "duration-2000 rotate-[calc(var(--aperture-rotation)*1deg)] transition-all ease-in-out"
          )}
        />
      </div>
    </div>
  )
}
