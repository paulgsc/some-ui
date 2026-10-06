import type { JSX } from "react"
import { useMemo } from "react"
import { ACTIVITY_CATALOG } from "@some-ui/activity-catalog"
import type {
  ActivityConfigValues,
  ActivityId,
} from "@some-ui/activity-catalog"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageControls,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@some-ui/shared"
import { useFittedPage } from "some-ui-utils"

import { ActivityIcon } from "@/components/activity-icon"
import { ActivityInputNote } from "@/components/activity/activity-input"

type ConfigurableActivity = {
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

  // Numbered against the full list before paginating, so "#N" is stable.
  const ordinalByInstanceId = new Map<string, number>()
  const seenById = new Map<ActivityId, number>()
  for (const item of items) {
    const ordinal = (seenById.get(item.activityId) ?? 0) + 1
    seenById.set(item.activityId, ordinal)
    ordinalByInstanceId.set(item.instanceId, ordinal)
  }

  // Memoized: a fresh array reads to `useFittedPage` as new content and
  // re-tries a page size already measured too tall.
  const paged = useMemo(() => [...items], [items])
  const {
    viewportRef,
    contentRef,
    pageItems,
    page,
    pageCount,
    next: nextPage,
    previous: previousPage,
  } = useFittedPage(paged, {
    minPerPage: 1,
    maxPerPage: 12,
    // Editing a field rebuilds `items` via `.map()` without changing any
    // card's height (`ActivityInputNote` depends only on `activityId`). Read as
    // new content, it could grow `perPage` mid-edit and slide another card
    // under the one being typed into.
    getItemKey: (item) => item.instanceId,
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div
        ref={viewportRef}
        data-scroll-intent="fitted-residue"
        className={
          // scroll-intent: fitted-residue — see activity-picker-step.tsx's
          // catalogue box: the one item taller than the box at `minPerPage`
          // scrolls here rather than being clipped unclickable.
          "min-h-0 flex-1 overflow-y-auto handheld:no-scrollbar"
        }
      >
        <div ref={contentRef} className="space-y-4">
          {pageItems.map((item) => {
            const activity = ACTIVITY_CATALOG[item.activityId]
            const config = item.config
            const total = totalById.get(item.activityId) ?? 1
            const ordinal = ordinalByInstanceId.get(item.instanceId) ?? 1

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
                        typeof rawValue === "string"
                          ? rawValue
                          : field.defaultValue
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
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
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
                  {/* On the last screen before the session is built, for an
                  activity that becomes a different exercise on a phone. */}
                  <ActivityInputNote
                    activity={activity}
                    className="sm:col-span-2"
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
      <PageControls
        page={page}
        pageCount={pageCount}
        onPrevious={previousPage}
        onNext={nextPage}
        label="activities"
      />
    </div>
  )
}
