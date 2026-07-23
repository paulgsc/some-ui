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

export type ConfigurableActivity = {
  instanceId: string
  activityId: ActivityId
  config: ActivityConfigValues
}

type ConfigureStepProps = {
  items: ReadonlyArray<ConfigurableActivity>
  onFieldChange: (
    instanceId: string,
    key: string,
    value: string | number
  ) => void
}

export const ConfigureStep = ({
  items,
  onFieldChange,
}: ConfigureStepProps): JSX.Element => {
  const totalById = new Map<ActivityId, number>()
  for (const item of items) {
    totalById.set(item.activityId, (totalById.get(item.activityId) ?? 0) + 1)
  }
  const ordinalById = new Map<ActivityId, number>()

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const activity = ACTIVITY_CATALOG[item.activityId]
        const config = item.config
        const total = totalById.get(item.activityId) ?? 1
        const ordinal = (ordinalById.get(item.activityId) ?? 0) + 1
        ordinalById.set(item.activityId, ordinal)

        return (
          <Card key={item.instanceId}>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <ActivityIcon
                icon={activity.icon}
                className="text-primary size-5"
              />
              <CardTitle className="text-base">
                {activity.name}
                {total > 1 && (
                  <span className="text-muted-foreground ml-1.5 text-sm font-normal">
                    #{ordinal}
                  </span>
                )}
              </CardTitle>
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
                          onFieldChange(item.instanceId, field.key, next)
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
                    <Label htmlFor={`${item.instanceId}-duration`}>
                      {field.label} (minutes)
                    </Label>
                    <Input
                      id={`${item.instanceId}-duration`}
                      type="number"
                      min={field.minMinutes}
                      max={field.maxMinutes}
                      step={field.stepMinutes}
                      value={durationValue}
                      onChange={(e) => {
                        const parsed = Number(e.target.value)
                        if (!Number.isNaN(parsed)) {
                          onFieldChange(
                            item.instanceId,
                            "durationMinutes",
                            parsed
                          )
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
}
