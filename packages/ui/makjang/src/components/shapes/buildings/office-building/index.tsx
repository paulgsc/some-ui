import type { FC } from "react"
import { cn } from "some-ui-utils"

type OfficeBuildingProps = {
  className?: string
}
export const OfficeBuilding: FC<OfficeBuildingProps> = ({ className }) => {
  return (
    <div className={cn("relative h-48 w-32 bg-pink-400", className)}>
      <div className="absolute inset-0 grid grid-cols-3 gap-2 p-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-white/20" />
        ))}
      </div>
    </div>
  )
}
