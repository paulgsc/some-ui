import type { JSX } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "some-ui-shared"

import { ACTIVITY_CATALOG } from "@/lib/activity-catalog"
import type { ActivityConfigValues, ActivityId } from "@/lib/activity-catalog"
import { ActivityIcon } from "@/components/activity-icon"

type ConfigureStepProps = {
  selectedIds: ReadonlyArray<ActivityId>
  configs: Partial<Record<ActivityId, ActivityConfigValues>>
  onFieldChange: (
    activityId: ActivityId,
    key: string,
    value: string | number
  ) => void
}

export const ConfigureStep = ({
  selectedIds,
  configs,
  onFieldChange,
}: ConfigureStepProps): JSX.Element => (
  <div className="space-y-4">
    {selectedIds.map((activityId) => {
      const activity = ACTIVITY_CATALOG[activityId]
      const config = configs[activityId] ?? activity.defaultConfig

      return (
        <Card key={activityId}>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <ActivityIcon
              icon={activity.icon}
              className="text-primary size-5"
            />
            <CardTitle className="text-base">{activity.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {activity.fields.map((field) => {
              if (field.kind === "select") {
                const rawValue = config[field.key]
                const value =
                  typeof rawValue === "string" ? rawValue : field.defaultValue
                return (
                  <div key={field.key} className="space-y-2">
                    <Label>{field.label}</Label>
                    <Select
                      value={value}
                      onValueChange={(next: string) =>
                        onFieldChange(activityId, field.key, next)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              }

              const durationValue =
                typeof config.durationMinutes === "number"
                  ? config.durationMinutes
                  : field.defaultMinutes

              return (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`${activityId}-duration`}>
                    {field.label} (minutes)
                  </Label>
                  <Input
                    id={`${activityId}-duration`}
                    type="number"
                    min={field.minMinutes}
                    max={field.maxMinutes}
                    step={field.stepMinutes}
                    value={durationValue}
                    onChange={(e) => {
                      const parsed = Number(e.target.value)
                      if (!Number.isNaN(parsed)) {
                        onFieldChange(activityId, "durationMinutes", parsed)
                      }
                    }}
                  />
                </div>
              )
            })}
          </CardContent>
        </Card>
      )
    })}
  </div>
)
