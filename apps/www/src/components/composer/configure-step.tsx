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

  // Computed against the full list before paginating, so an instance's "#N"
  // label stays stable regardless of which page it's currently showing on.
  const ordinalByInstanceId = new Map<string, number>()
  const seenById = new Map<ActivityId, number>()
  for (const item of items) {
    const ordinal = (seenById.get(item.activityId) ?? 0) + 1
    seenById.set(item.activityId, ordinal)
    ordinalByInstanceId.set(item.instanceId, ordinal)
  }

  // Memoized for `useFittedPage`: a fresh array each render reads to it as a
  // genuine content change, which is its cue to re-try a page size it had
  // already measured as too tall.
  const paged = useMemo(() => [...items], [items])
  const {
    viewportRef,
    contentRef,
    pageItems,
    page,
    pageCount,
    next: nextPage,
    previous: previousPage,
  } = useFittedPage(paged, { minPerPage: 1, maxPerPage: 12 })

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div
        ref={viewportRef}
        data-scroll-intent="fitted-residue"
        className={
          // scroll-intent: fitted-residue — `useFittedPage` guarantees this
          // box's content fits it, with exactly one documented exception:
          // at `minPerPage` a single item taller than the whole box has to
          // overflow somewhere (see the hook's own Options doc). This says
          // where. It is not a greedy scroll - in every case the fit can
          // actually solve, the scrollbar never appears because the content
          // genuinely fits - it is the named home for the residue the fit
          // is honest about not being able to remove. Clipping it instead
          // is worse than it sounds: a card whose centre falls outside the
          // box stops being clickable at all.
          "min-h-0 flex-1 overflow-y-auto"
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
                  {/* Said here, on the last screen before the session is built,
                  and only for an activity whose small-screen interaction is a
                  genuinely different exercise. A person configuring a session
                  length is committing to the thing; finding out afterwards
                  that their phone plays a different exercise is exactly the
                  disclosure this is for. */}
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
