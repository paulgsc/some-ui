import type { FC } from "react"
import { cn } from "some-ui-utils"

type ModernBuildingProps = {
  className?: string
}

const WINDOWS = [0, 1, 2, 3, 4, 5, 6, 7]

export const ModernBuilding: FC<ModernBuildingProps> = ({ className }) => {
  return (
    <div className={cn("relative h-56 w-24 bg-purple-400 ", className)}>
      <div className="absolute inset-0 grid grid-cols-2 gap-4 p-4">
        {WINDOWS.map((id) => (
          <div key={id} className="h-4 rounded-full bg-white/20" />
        ))}
      </div>
    </div>
  )
}
