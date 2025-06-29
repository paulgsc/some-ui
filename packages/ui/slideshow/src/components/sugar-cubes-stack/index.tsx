import type { FC } from "react"
import { SugarCube } from "@slideshow/components/sugar-cube"
import { cn } from "some-ui-utils"

type SugarCubesStackProps = {
  className?: string
}

export const SugarCubesStack: FC<SugarCubesStackProps> = ({ className }) => {
  return (
    <div className={cn("relative aspect-square size-full", className)}>
      {/* Bottom left cube */}
      <div
        className="absolute left-[12.5%] top-1/2 size-[37.5%]"
        style={{
          filter: "drop-shadow(5px 10px 8px rgba(0, 0, 0, 0.3))",
        }}
      >
        <SugarCube
          perspective={1000}
          className="border-[3px] border-black bg-white"
          rotationAxis="Y-axis"
        />
      </div>

      {/* Bottom right cube */}
      <div
        className="absolute left-[45%] top-[55%] size-[37.5%]"
        style={{
          filter: "drop-shadow(8px 12px 8px rgba(0, 0, 0, 0.25))",
        }}
      >
        <SugarCube
          perspective={1000}
          className="border-[3px] border-black bg-white"
          rotationAxis="Y-axis"
        />
      </div>

      {/* Top cube */}
      <div
        className="absolute left-[30%] top-[20%] z-10 size-[37.5%]"
        style={{
          filter: "drop-shadow(6px 8px 8px rgba(0, 0, 0, 0.2))",
        }}
      >
        <SugarCube
          perspective={1000}
          className="border-[3px] border-black bg-white"
          rotationAxis="Y-axis"
        />
      </div>
    </div>
  )
}
