import "./index.css"

import type { ReactNode } from "react"
import { useCallback, useState } from "react"
import { useAperture } from "@slideshow/hooks/use-aperture"
import { useApertureTimeout } from "@slideshow/hooks/use-aperture-timeout"
import { cn } from "some-ui-utils"

type LensShutterProps = {
  className?: string
  children: ReactNode
}

const DURATION = 2000 // ms

export const LensShutter = ({
  className,
  children,
}: LensShutterProps): React.JSX.Element => {
  const [showAperture, setShowAperture] = useState<boolean>(true)
  const {
    topX,
    rightX,
    leftX,
    rightY,
    leftY,
    apertureSize,
    apertureRotation,
    apertureOpacity,
    state,
  } = useAperture()
  const callback = useCallback(() => {
    setShowAperture(state === "progress")
  }, [state])
  useApertureTimeout({ duration: DURATION, callback })
  const clipPath = `polygon(
    ${topX}% 0%,
    ${rightX}% ${rightY}%,
    ${rightX}% ${100 - rightY}%,
    ${topX}% 100%,
    ${leftX}% ${100 - leftY}%,
    ${leftX}% ${leftY}%
  )`
  return (
    <>
      {showAperture ? (
        <div
          className={cn(
            "transform-3d perspective-[1250px] flex size-full items-center justify-center",
            className
          )}
        >
          <div
            className={cn(
              "inset-shadow-lg inset-shadow-red-700 ring-10 relative flex size-full items-center justify-center",
              "duration-2000 rounded-full ring-gray-800 transition-all",
              "opacity-[calc(var(--aperture-opacity)*1%)]",
              "aspect-square h-[min(100%,100vw)] w-[min(100%,100vh)]"
            )}
            style={{
              "--aperture-opacity": apertureOpacity,
            }}
          >
            <div className="-translate-z-10 absolute inset-0 z-0 rounded-full border-4 border-white bg-gray-950" />
            <div
              style={{
                "--aperture-size": apertureSize,
                "--top-x": topX,
                "--right-x": rightX,
                "--right-y": rightY,
                "--left-x": leftX,
                "--left-y": leftY,
                "--aperture-rotation": apertureRotation,
                clipPath,
              }}
              className={cn(
                "z-10 size-[calc(var(--aperture-size)*1%)] rounded-full border-4 border-white bg-gray-600",
                "duration-2000 rotate-[calc(var(--aperture-rotation)*1deg)] transition-all ease-in-out"
              )}
            />
          </div>
        </div>
      ) : (
        <> {children}</>
      )}
    </>
  )
}
