import type { JSX } from "react"
import { Check } from "lucide-react"
import { Card, CardContent } from "some-ui-shared"
import { cn } from "some-ui-utils"

import { ACTIVITY_CATALOG, ACTIVITY_IDS } from "@/lib/activity-catalog"
import type { ActivityId } from "@/lib/activity-catalog"
import { ActivityIcon } from "@/components/activity-icon"

type ActivityPickerStepProps = {
  selectedIds: ReadonlyArray<ActivityId>
  onToggle: (id: ActivityId) => void
}

export const ActivityPickerStep = ({
  selectedIds,
  onToggle,
}: ActivityPickerStepProps): JSX.Element => (
  <div className="space-y-3">
    <p className="text-muted-foreground text-sm">
      Pick one or more activities for this session. You will configure each one
      in the next step.
    </p>
    <div className="grid gap-3 sm:grid-cols-2">
      {ACTIVITY_IDS.map((id) => {
        const activity = ACTIVITY_CATALOG[id]
        const isSelected = selectedIds.includes(id)
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            className="text-left"
          >
            <Card
              className={cn(
                "h-full transition-colors",
                isSelected
                  ? "border-primary ring-primary ring-1"
                  : "hover:border-primary/50"
              )}
            >
              <CardContent className="flex items-start gap-3 pt-6">
                <ActivityIcon
                  icon={activity.icon}
                  className="text-primary size-6 shrink-0"
                />
                <div className="flex-1">
                  <p className="font-semibold">{activity.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {activity.description}
                  </p>
                </div>
                {isSelected && (
                  <div className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full">
                    <Check className="size-3" />
                  </div>
                )}
              </CardContent>
            </Card>
          </button>
        )
      })}
    </div>
  </div>
)
