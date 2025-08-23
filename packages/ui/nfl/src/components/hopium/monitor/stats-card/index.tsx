import type { FilterType } from "@nfl/types/hopium-tracker"
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
}: StatsCardProps) => {
  const isActive = activeFilter === filter
  const ringColor =
    variant === "destructive"
      ? "ring-destructive"
      : variant === "secondary"
        ? "ring-secondary"
        : "ring-primary"
  const textColor =
    variant === "destructive" ? "text-destructive" : "text-foreground"

  return (
    <Card
      className={`cursor-pointer p-3 transition-all hover:shadow-md ${isActive ? `ring-2 ${ringColor}` : ""}`}
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
