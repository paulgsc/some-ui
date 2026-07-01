import type { JSX } from "react"
import { StatusLegend } from "@resume/components/graveyard/status-legend"
import type { Repository } from "@resume/types/graveyard"

type LegendProps = {
  repositories: Array<Repository>
}

export const Legend = ({ repositories }: LegendProps): JSX.Element => {
  const totalPackages = repositories.reduce(
    (acc, repo) => acc + repo.packages.length,
    0
  )

  return (
    <div className="text-muted-foreground mt-4 flex items-center justify-between text-sm">
      <StatusLegend />
      <div>Total Packages: {totalPackages}</div>
    </div>
  )
}
