import type { JSX } from "react"
import { Plus, X } from "lucide-react"
import { Badge, Button, Card, CardContent } from "@some-ui/shared"
import { cn } from "some-ui-utils"

import {
  ACTIVITY_CATALOG,
  ACTIVITY_IDS,
  getActivity,
} from "@/lib/activity-catalog"
import type { ActivityId } from "@/lib/activity-catalog"
import { usePagination } from "@/hooks/use-pagination"
import { ActivityIcon } from "@/components/activity-icon"
import { PaginationControls } from "@/components/pagination-controls"

/** Rows here are compact (one line each), so a larger page fits comfortably. */
const MANIFEST_PAGE_SIZE = 10

type PickedActivity = {
  instanceId: string
  activityId: ActivityId
}

type ActivityPickerStepProps = {
  items: ReadonlyArray<PickedActivity>
  onAdd: (id: ActivityId) => void
  onRemove: (instanceId: string) => void
}

export const ActivityPickerStep = ({
  items,
  onAdd,
  onRemove,
}: ActivityPickerStepProps): JSX.Element => {
  const countsById = new Map<ActivityId, number>()
  for (const item of items) {
    countsById.set(item.activityId, (countsById.get(item.activityId) ?? 0) + 1)
  }

  // Numbered against the full list before paginating, so the badge always
  // reflects each instance's true position in the session, not its position
  // within the current page.
  const numberedItems = items.map((item, index) => ({
    item,
    position: index + 1,
  }))
  const { pageItems, currentPage, totalPages, goToPreviousPage, goToNextPage } =
    usePagination(numberedItems, MANIFEST_PAGE_SIZE)

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Add one or more activities to this session. The same activity can be
        added more than once - e.g. two Hangul Honeycomb blocks with different
        modes - and you will configure each one separately in the next step.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ACTIVITY_IDS.map((id) => {
          const activity = ACTIVITY_CATALOG[id]
          const count = countsById.get(id) ?? 0
          return (
            <button
              key={id}
              type="button"
              onClick={() => onAdd(id)}
              className="text-left"
            >
              <Card
                className={cn(
                  "h-full transition-colors",
                  count > 0 ? "border-primary/50" : "hover:border-primary/50"
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
                  <div className="flex shrink-0 items-center gap-1.5">
                    {count > 0 && <Badge variant="secondary">×{count}</Badge>}
                    <div className="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center rounded-full">
                      <Plus className="size-3" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          )
        })}
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Added to this session{" "}
            <span className="text-muted-foreground font-normal">
              ({items.length})
            </span>
          </p>
          <div className="space-y-1.5">
            {pageItems.map(({ item, position }) => {
              const activity = getActivity(item.activityId)
              return (
                <div
                  key={item.instanceId}
                  className="bg-muted/50 flex items-center gap-2 rounded-md border px-3 py-1.5"
                >
                  <span className="bg-muted flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                    {position}
                  </span>
                  <ActivityIcon
                    icon={activity.icon}
                    className="text-primary size-4 shrink-0"
                  />
                  <span className="flex-1 text-sm">{activity.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onRemove(item.instanceId)}
                    title="Remove"
                    className="text-muted-foreground hover:text-destructive size-6 p-0"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPrevious={goToPreviousPage}
            onNext={goToNextPage}
          />
        </div>
      )}
    </div>
  )
}
