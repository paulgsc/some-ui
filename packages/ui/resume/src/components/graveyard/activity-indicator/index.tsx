import { SunIcon, Zap } from "lucide-react"

import type { PackageStatus } from "@resume/types/graveyard"

type ActivityIndicatorProps = {
  status: PackageStatus
}

export const ActivityIndicator = ({ status }: ActivityIndicatorProps) => {
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
