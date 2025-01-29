import type { FC } from "react"
import { cn } from "some-ui-utils"

type ModernBuildingProps = {
  className?: string
}
export const ModernBuilding: FC<ModernBuildingProps> = ({ className }) => {
  return (
    <div className={cn("relative h-56 w-24 bg-purple-400 ", className)}>
      <div className="absolute inset-0 grid grid-cols-2 gap-4 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-4 rounded-full bg-white/20" />
        ))}
      </div>
    </div>
  )
}
