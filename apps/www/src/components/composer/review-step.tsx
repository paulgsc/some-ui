import type { JSX } from "react"
import type { SceneConfig } from "@some-ui/types"
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "some-ui-shared"

import { ACTIVITY_CATALOG } from "@/lib/activity-catalog"
import type { ActivityConfigValues, ActivityId } from "@/lib/activity-catalog"
import { formatDurationMs } from "@/lib/format"
import { usePagination } from "@/hooks/use-pagination"
import { ActivityIcon } from "@/components/activity-icon"
import { PaginationControls } from "@/components/pagination-controls"

import { summarizeConfig, totalDurationOfScenes } from "./utils"

const REVIEW_PAGE_SIZE = 10

type ReviewStepProps = {
  items: ReadonlyArray<{
    instanceId: string
    activityId: ActivityId
    config: ActivityConfigValues
  }>
  scenes: Array<SceneConfig>
  mode: "basic" | "advanced"
  sessionName: string
  onSessionNameChange: (name: string) => void
  defaultName: string
}

export const ReviewStep = ({
  items,
  scenes,
  mode,
  sessionName,
  onSessionNameChange,
  defaultName,
}: ReviewStepProps): JSX.Element => {
  const totalDurationMs = totalDurationOfScenes(scenes)

  // Numbered against the full list before paginating, same reasoning as the
  // other composer steps' lists.
  const numberedItems = items.map((item, index) => ({
    item,
    position: index + 1,
  }))
  const { pageItems, currentPage, totalPages, goToPreviousPage, goToNextPage } =
    usePagination(numberedItems, REVIEW_PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="session-name">Session name</Label>
        <Input
          id="session-name"
          placeholder={defaultName}
          value={sessionName}
          onChange={(e) => onSessionNameChange(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Activities{" "}
            <span className="text-muted-foreground font-normal">
              ({items.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pageItems.map(({ item, position }) => {
            const activity = ACTIVITY_CATALOG[item.activityId]
            return (
              <div key={item.instanceId} className="flex items-center gap-3">
                <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                  {position}
                </span>
                <ActivityIcon
                  icon={activity.icon}
                  className="text-primary size-5 shrink-0"
                />
                <div>
                  <p className="font-medium">{activity.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {summarizeConfig(activity, item.config)}
                  </p>
                </div>
              </div>
            )
          })}
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPrevious={goToPreviousPage}
            onNext={goToNextPage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="text-muted-foreground text-sm">Total duration</p>
            <p className="font-semibold">{formatDurationMs(totalDurationMs)}</p>
          </div>
          <Badge variant="outline">
            {mode === "advanced" ? "Advanced arrangement" : "Basic arrangement"}
          </Badge>
        </CardContent>
      </Card>
    </div>
  )
}
