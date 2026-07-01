import type { JSX } from "react"
import type { SatelliteDataItem } from "@nfl/types/hopium/hopium-tracker"
import {
  getFreshnessStatus,
  getUrgencyClass,
} from "@nfl/utils/hopium/monitor-utils"
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
} from "some-ui-shared"

type SatelliteCardProps<T> = {
  item: SatelliteDataItem<T>
  onClick: (item: SatelliteDataItem<T>) => void
}

export function SatelliteCard<T>({
  item,
  onClick,
}: SatelliteCardProps<T>): JSX.Element {
  const status = getFreshnessStatus(item.freshness)
  const urgencyClass = getUrgencyClass(item.freshness, item.priority)

  return (
    <Card
      className={`cursor-pointer bg-[oklch(0.984_0.024_83.915)] transition-all duration-300 hover:scale-105 hover:shadow-lg ${urgencyClass} flex flex-col`}
      onClick={() => onClick(item)}
    >
      <CardHeader className="flex-none pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="truncate font-serif text-sm">
            {item.name}
          </CardTitle>
          <Badge variant={status.variant} className="text-xs">
            {status.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between space-y-2">
        <div className="space-y-2">
          <p className="text-muted-foreground truncate text-xs">
            {(item.data as any)?.dataType || "Unknown"}
          </p>

          {/* Freshness Progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>Freshness</span>
              <span className="font-medium">{Math.round(item.freshness)}%</span>
            </div>
            <Progress value={item.freshness} className="h-1" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Badge
            variant={item.priority === "critical" ? "destructive" : "outline"}
            className="text-xs capitalize"
          >
            {item.priority}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {new Date(item.lastUpdated).toLocaleString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
