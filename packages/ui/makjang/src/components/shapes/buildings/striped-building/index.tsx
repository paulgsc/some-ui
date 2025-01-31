import type { FC } from "react"
import { cn } from "some-ui-utils"

type StripedBuildingProps = {
  className?: string
}
export const StripedBuilding: FC<StripedBuildingProps> = ({
  className,
}): React.JSX.Element => {
  return (
    <div className={cn("relative h-40 w-28", className)}>
      <div className="absolute inset-0 bg-green-400">
        <div className="flex h-full flex-col justify-between py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-2 bg-green-300" />
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 -top-4 h-8 bg-green-400 [clip-path:polygon(50%_0%,0%_100%,100%_100%)]" />
    </div>
  )
}
