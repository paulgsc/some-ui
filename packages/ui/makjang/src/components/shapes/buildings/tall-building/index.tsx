import type { FC } from "react"
import { cn } from "some-ui-utils"

type TallBuildingProps = {
  className?: string
}

const WINDOWS = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]

export const TallBuilding: FC<TallBuildingProps> = ({ className }) => {
  return (
    <div className={cn("relative h-64 w-24 bg-blue-400", className)}>
      <div className="absolute inset-0 grid grid-cols-6 gap-2 p-2">
        {WINDOWS.map((id) => (
          <div key={id} className="h-4 bg-white/20" />
        ))}
      </div>
      <div className="absolute inset-x-0 -top-4 h-8 bg-blue-400 [clip-path:polygon(50%_0%,0%_100%,100%_100%)]" />
    </div>
  )
}
