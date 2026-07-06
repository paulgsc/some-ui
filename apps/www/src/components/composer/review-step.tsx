import type { JSX } from "react"
import type { SceneConfig } from "some-types-utils"
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
import { ActivityIcon } from "@/components/activity-icon"

import { formatDurationMs, summarizeConfig } from "./utils"

type ReviewStepProps = {
  selectedIds: ReadonlyArray<ActivityId>
  configs: Partial<Record<ActivityId, ActivityConfigValues>>
  scenes: Array<SceneConfig>
  mode: "basic" | "advanced"
  sessionName: string
  onSessionNameChange: (name: string) => void
  defaultName: string
}

export const ReviewStep = ({
  selectedIds,
  configs,
  scenes,
  mode,
  sessionName,
  onSessionNameChange,
  defaultName,
}: ReviewStepProps): JSX.Element => {
  const totalDurationMs = scenes.reduce(
    (max, scene) => Math.max(max, scene.start_time + scene.duration),
    0
  )

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
          <CardTitle className="text-base">Activities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedIds.map((activityId, index) => {
            const activity = ACTIVITY_CATALOG[activityId]
            const config = configs[activityId] ?? activity.defaultConfig
            return (
              <div key={activityId} className="flex items-center gap-3">
                <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                  {index + 1}
                </span>
                <ActivityIcon
                  icon={activity.icon}
                  className="text-primary size-5 shrink-0"
                />
                <div>
                  <p className="font-medium">{activity.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {summarizeConfig(activity, config)}
                  </p>
                </div>
              </div>
            )
          })}
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
