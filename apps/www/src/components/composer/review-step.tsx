import type { JSX } from "react"
import { useMemo } from "react"
import {
  ACTIVITY_CATALOG,
  summarizeConfig,
  totalDurationOfScenes,
} from "@some-ui/activity-catalog"
import type {
  ActivityConfigValues,
  ActivityId,
} from "@some-ui/activity-catalog"
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  LABEL_WHEN_TALL,
  PageControls,
  ROOMY_WHEN_TALL,
  SHORT_WINDOW_ONLY,
  TALL_WINDOW_ONLY,
} from "@some-ui/shared"
import type { SceneConfig } from "@some-ui/types"
import { cn, useFittedPage } from "some-ui-utils"

import { formatDurationMs } from "@/lib/format"
import { ActivityIcon } from "@/components/activity-icon"

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
  // Memoized: `useFittedPage` reads a new `items` reference as a real content
  // change and re-tries a rejected page size on it, so an array rebuilt every
  // render would keep re-opening a fit it had already settled.
  const numberedItems = useMemo(
    () => items.map((item, index) => ({ item, position: index + 1 })),
    [items]
  )
  const arrangementLabel =
    mode === "advanced" ? "Advanced arrangement" : "Basic arrangement"

  const {
    viewportRef,
    contentRef,
    pageItems,
    page,
    pageCount,
    next: nextPage,
    previous: previousPage,
  } = useFittedPage(numberedItems, { minPerPage: 1, maxPerPage: 20 })

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="shrink-0 space-y-2">
        <Label htmlFor="session-name" className={LABEL_WHEN_TALL}>
          Session name
        </Label>
        <Input
          id="session-name"
          placeholder={defaultName}
          value={sessionName}
          onChange={(e) => onSessionNameChange(e.target.value)}
        />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className={cn("shrink-0", TALL_WINDOW_ONLY)}>
          <CardTitle className="text-base">
            Activities{" "}
            <span className="text-muted-foreground font-normal">
              ({items.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent
          className={cn("flex min-h-0 flex-1 flex-col gap-3", ROOMY_WHEN_TALL)}
        >
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
            <div ref={contentRef} className="space-y-3">
              {pageItems.map(({ item, position }) => {
                const activity = ACTIVITY_CATALOG[item.activityId]
                return (
                  <div
                    key={item.instanceId}
                    className="flex items-center gap-3"
                  >
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
            </div>
          </div>
          <PageControls
            page={page}
            pageCount={pageCount}
            onPrevious={previousPage}
            onNext={nextPage}
            label="activities"
          />
        </CardContent>
      </Card>

      {/* The same two facts, twice, because a short window cannot afford the
          card that carries them. Stacked in a card of its own it is ~64px of
          padding and border around two lines of text - on a landscape phone
          that is most of what the activity list has left, so the short form
          keeps the facts and drops the box. */}
      <Card className={cn("shrink-0", TALL_WINDOW_ONLY)}>
        <CardContent className="flex items-center justify-between py-6">
          <div className="min-w-0">
            <p className="text-muted-foreground text-sm">Total duration</p>
            <p className="font-semibold">{formatDurationMs(totalDurationMs)}</p>
          </div>
          <Badge variant="outline">{arrangementLabel}</Badge>
        </CardContent>
      </Card>
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 text-sm",
          SHORT_WINDOW_ONLY
        )}
      >
        <span className="text-muted-foreground min-w-0 truncate">
          Total duration{" "}
          <span className="text-foreground font-semibold">
            {formatDurationMs(totalDurationMs)}
          </span>
        </span>
        <Badge variant="outline" className="shrink-0">
          {arrangementLabel}
        </Badge>
      </div>
    </div>
  )
}
