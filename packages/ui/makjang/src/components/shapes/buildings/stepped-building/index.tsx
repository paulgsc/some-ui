import type { FC } from "react"
import { cn } from "some-ui-utils"

type SteppedBuildingProps = {
  className?: string
}
export const SteppedBuilding: FC<SteppedBuildingProps> = ({ className }) => {
  return (
    <div className={cn("relative h-72 w-28", className)}>
      <div className="absolute bottom-0 h-72 w-full bg-purple-400" />
      <div className="absolute inset-x-4 bottom-0 h-60 bg-purple-500" />
      <div className="absolute inset-x-8 bottom-0 h-48 bg-purple-600" />
      <div className="absolute inset-x-12 bottom-0 h-36 bg-purple-700" />
    </div>
  )
}
