import type { JSX } from "react"
import { useMemo, useRef, useState } from "react"
import type { ActivityDefinition, ActivityId } from "@some-ui/activity-catalog"
import {
  ACTIVITY_CATALOG,
  ACTIVITY_IDS,
  getActivity,
  searchActivities,
} from "@some-ui/activity-catalog"
import { Badge, Button, Card, CardContent, PageControls } from "@some-ui/shared"
import { Plus, X } from "lucide-react"
import { cn, useFittedPage } from "some-ui-utils"

import { usePagination } from "@/hooks/use-pagination"
import { ActivityIcon } from "@/components/activity-icon"
import { ActivityInputHint } from "@/components/activity/activity-input"
import { ActivityMaturityBadge } from "@/components/activity/activity-maturity"
import {
  ActivitySearchField,
  useSearchHotkey,
} from "@/components/activity/activity-search-field"
import { AudioActivityHint } from "@/components/audio/audio-activity-notice"
import { PaginationControls } from "@/components/pagination-controls"

/** Rows here are compact (one line each), so a larger page fits comfortably. */
const MANIFEST_PAGE_SIZE = 10

/**
 * The box the catalogue grid has to fit.
 *
 * A fixed height, not a viewport percentage: `max-h-[Nvh]` is banned here
 * (see docs/ui-fit) precisely because it makes the amount of unreachable
 * content a function of the window. Bounding the surface and paging what
 * doesn't fit is the sanctioned move, and `useFittedPage` measures this box
 * to decide how many cards that is.
 */
const CATALOGUE_BOX = "h-72 sm:h-80"

const CATALOGUE: ReadonlyArray<ActivityDefinition> = ACTIVITY_IDS.map(
  (id) => ACTIVITY_CATALOG[id]
)

type PickedActivity = {
  instanceId: string
  activityId: ActivityId
}

type ActivityPickerStepProps = {
  items: ReadonlyArray<PickedActivity>
  onAdd: (id: ActivityId) => void
  onRemove: (instanceId: string) => void
}

/**
 * The composer's picker: the whole catalogue, paged (#856).
 *
 * Recommendation is the dashboard's answer and the wrong one here - someone
 * composing a session wants to see what exists. Paging is the right one, and
 * half of this file already knew that: the picked-items list below has run
 * through `usePagination` since it was written. The catalogue grid above it
 * did not, and rendered `ACTIVITY_IDS.map` into a fixed grid instead.
 *
 * Search and paging are complements rather than alternatives - the field
 * narrows the catalogue, the pager walks whatever is left.
 */
export const ActivityPickerStep = ({
  items,
  onAdd,
  onRemove,
}: ActivityPickerStepProps): JSX.Element => {
  const [query, setQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  useSearchHotkey(searchRef)

  const countsById = new Map<ActivityId, number>()
  for (const item of items) {
    countsById.set(item.activityId, (countsById.get(item.activityId) ?? 0) + 1)
  }

  // An empty query is "no search", not "no results" - `searchActivities`
  // returns nothing for one on purpose, so the unfiltered catalogue is the
  // explicit fallback rather than something the matcher has to fake.
  const visible = useMemo(
    () =>
      query.trim().length > 0
        ? searchActivities(CATALOGUE, query, { limit: CATALOGUE.length })
        : CATALOGUE,
    [query]
  )

  // Fitted rather than a constant page size: the card height varies with what
  // each activity carries (a maturity note, an audio hint), so dividing the
  // box by an average silently overflows on the pages with the tall cards.
  // Destructured rather than held as an object: `useFittedPage` hands back
  // two refs alongside the page data, and react-hooks/refs reads any property
  // access on that object as a ref read during render.
  const {
    viewportRef,
    contentRef,
    pageItems: visiblePage,
    page,
    pageCount,
    next: nextPage,
    previous: previousPage,
  } = useFittedPage(visible, { minPerPage: 2, maxPerPage: 12 })

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

      <ActivitySearchField
        value={query}
        onChange={setQuery}
        inputRef={searchRef}
        placeholder="Filter activities"
      />

      {visible.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
          No activity matches &ldquo;{query.trim()}&rdquo;
        </p>
      ) : (
        <>
          <div ref={viewportRef} className={CATALOGUE_BOX}>
            <div
              ref={contentRef}
              className="grid content-start gap-3 sm:grid-cols-2"
            >
              {visiblePage.map((activity) => {
                const count = countsById.get(activity.id) ?? 0
                return (
                  <button
                    key={activity.id}
                    type="button"
                    onClick={() => onAdd(activity.id)}
                    className="text-left"
                  >
                    <Card
                      className={cn(
                        "h-full transition-colors",
                        count > 0
                          ? "border-primary/50"
                          : "hover:border-primary/50"
                      )}
                    >
                      <CardContent className="flex items-start gap-3 pt-6">
                        <ActivityIcon
                          icon={activity.icon}
                          className="text-primary size-6 shrink-0"
                        />
                        <div className="flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{activity.name}</p>
                            <ActivityMaturityBadge activity={activity} />
                          </div>
                          <p className="text-muted-foreground text-sm">
                            {activity.description}
                          </p>
                          {/* Both said while the person is still choosing, so
                              neither what this does to their ears nor what it
                              asks of their hands is a surprise once the
                              session starts. */}
                          <ActivityInputHint activity={activity} />
                          <AudioActivityHint activity={activity} />
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {count > 0 && (
                            <Badge variant="secondary">×{count}</Badge>
                          )}
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
          </div>

          {/* Paging the catalogue does not touch `items`, so adding an
              activity from page 3 leaves you on page 3 - the fitted pager
              only resets when the list it is paging changes length. */}
          <PageControls
            page={page}
            pageCount={pageCount}
            onPrevious={previousPage}
            onNext={nextPage}
            label="activities"
          />
        </>
      )}

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
