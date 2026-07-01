import type { JSX } from "react"
import type { PackageStatus } from "@resume/types/graveyard"
import { SunIcon, Zap } from "lucide-react"

type ActivityIndicatorProps = {
  status: PackageStatus
}

export const ActivityIndicator = ({
  status,
}: ActivityIndicatorProps): JSX.Element | null => {
  switch (status.name) {
    case "flourishing":
      return (
        <div className="flex items-center gap-1">
          <Zap className="size-3 text-yellow-500" />
          <SunIcon className="size-3 text-yellow-500" />
          <Zap className="size-3 text-yellow-500" />
        </div>
      )
    case "growing":
      return (
        <div className="flex items-center gap-1">
          <SunIcon className="size-3 text-yellow-500" />
        </div>
      )
    default:
      return null
  }
}
