import type { FC } from "react"
import { cn } from "some-ui-utils"

type OfficeBuildingProps = {
  className?: string
}

const WINDOWS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

export const OfficeBuilding: FC<OfficeBuildingProps> = ({ className }) => {
  return (
    <div className={cn("relative h-48 w-32 bg-pink-400", className)}>
      <div className="absolute inset-0 grid grid-cols-3 gap-2 p-2">
        {WINDOWS.map((id) => (
          <div key={id} className="h-8 rounded bg-white/20" />
        ))}
      </div>
    </div>
  )
}
