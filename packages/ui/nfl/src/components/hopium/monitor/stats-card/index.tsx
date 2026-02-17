import type { JSX } from "react"
import type { FilterType } from "@nfl/types/hopium/hopium-tracker"
import type { LucideIcon } from "lucide-react"
import { Card } from "some-ui-shared"

type StatsCardProps = {
  title: string
  value: number | string
  icon: LucideIcon
  filter: FilterType
  activeFilter: FilterType
  onClick: (filter: FilterType) => void
  variant?: "default" | "destructive" | "secondary"
}

export const StatsCard = ({
  title,
  value,
  icon: Icon,
  filter,
  activeFilter,
  onClick,
  variant = "default",
}: StatsCardProps): JSX.Element => {
  const isActive = activeFilter === filter
  const ringColor =
    variant === "destructive"
      ? "ring-destructive"
      : variant === "secondary"
        ? "ring-secondary"
        : "ring-primary"
  return (
    <Card
      className={`cursor-pointer bg-[oklch(0.984_0.024_83.915)] p-3 transition-all hover:shadow-md ${isActive ? `ring-2 ${ringColor}` : ""}`}
      onClick={() => onClick(filter)}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={`size-4 ${
            variant === "destructive"
              ? "text-destructive"
              : variant === "secondary"
                ? "text-secondary"
                : "text-primary"
          }`}
        />
        <div>
          <p className="text-muted-foreground text-xs">{title}</p>
          <p
            className={`text-lg font-bold ${variant === "destructive" ? "text-destructive" : ""}`}
          >
            {value}
          </p>
        </div>
      </div>
    </Card>
  )
}
