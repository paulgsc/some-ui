import type { JSX } from "react"
import type { StatusLegendItem } from "@resume/types/graveyard"
import { AlertTriangle, Clock, Flower, Leaf, Skull } from "lucide-react"
import { cn } from "some-ui-utils"

export const StatusLegend = (): JSX.Element => {
  const statusItems: Array<StatusLegendItem> = [
    { icon: Flower, label: "Flourishing", color: "text-emerald-500" },
    { icon: Leaf, label: "Growing", color: "text-green-500" },
    { icon: Clock, label: "Stale", color: "text-amber-500" },
    { icon: AlertTriangle, label: "Neglected", color: "text-orange-500" },
    { icon: Skull, label: "Abandoned", color: "text-red-500" },
  ]

  return (
    <div className="flex items-center gap-4">
      {statusItems.map((status) => (
        <div key={status.label} className="flex items-center gap-1">
          <status.icon className={cn("size-4", status.color)} />
          <span>{status.label}</span>
        </div>
      ))}
    </div>
  )
}
