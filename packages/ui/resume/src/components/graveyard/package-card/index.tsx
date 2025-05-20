import { ActivityIndicator } from "@resume/components/graveyard/activity-indicator"
import type { Package } from "@resume/types/graveyard"
import { formatDate } from "@resume/utils/graveyard"
import { Clock } from "lucide-react"
import { Badge, Card, CardContent } from "some-ui-shared"
import { cn } from "some-ui-utils"

type PackageCardProps = {
  pkg: Package
}

export const PackageCard = ({ pkg }: PackageCardProps) => {
  const StatusIcon = pkg.status.icon

  return (
    <Card
      className={cn(
        "border-l-4 transition-all duration-300 hover:shadow-md",
        pkg.status.borderColor
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <StatusIcon className={cn("size-4", pkg.status.color)} />
              <h3 className="truncate text-sm font-medium">{pkg.name}</h3>
              <ActivityIndicator status={pkg.status} />
            </div>
            <p className="text-muted-foreground truncate text-xs">
              {pkg.description}
            </p>
          </div>
        </div>

        <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1">
            <Clock className="size-3" />
            <span>{formatDate(pkg.lastActivity)}</span>
          </div>
          <Badge
            variant="secondary"
            className={cn("text-xs", pkg.status.bgColor, pkg.status.color)}
          >
            {pkg.status.name}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
