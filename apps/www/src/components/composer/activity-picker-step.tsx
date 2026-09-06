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

import { ActivityIcon } from "@/components/activity-icon"
import { ActivityInputHint } from "@/components/activity/activity-input"
import { ActivityMaturityBadge } from "@/components/activity/activity-maturity"
import {
  ActivitySearchField,
  useSearchHotkey,
} from "@/components/activity/activity-search-field"
import { AudioActivityHint } from "@/components/audio/audio-activity-notice"

import { TALL_WINDOW_ONLY } from "./short-window"

/**
 * How the step's height is split between the two lists it shows.
 *
 * The catalogue is what the step is *for*, so it gets the larger share; the
 * manifest of what has been added is a running confirmation and gets the
 * rest. Both are shares of whatever the wizard's body turns out to be, not
 * measurements of their own - which is the whole difference from the fixed
 * `h-72 sm:h-80` this replaced. That box was a design-time constant, so it
 * fit exactly one window: a tall phone left a third of it empty and paged a
 * four-item catalogue into four pages, and a landscape phone spent 82% of
 * the window on it and pushed the wizard's own Continue below the fold.
 */
const CATALOGUE_SHARE = "min-h-0 flex-[3]"
const MANIFEST_SHARE = "min-h-0 flex-[2]"

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
 * half of this file already knew that: the picked-items list below has been
 * paged since it was written. The catalogue grid above it was not, and
 * rendered `ACTIVITY_IDS.map` into a fixed grid instead.
 *
 * Search and paging are complements rather than alternatives - the field
 * narrows the catalogue, the pager walks whatever is left.
 *
 * Both lists are fitted to shares of the step's own height rather than paged
 * by a constant, and that is the same decision twice rather than a preference:
 * a constant page size is wrong at every window but the one it was picked in,
 * and the two constants that used to live here (a `h-72 sm:h-80` box for the
 * catalogue, a page of 10 for the manifest) were each picked in a different
 * one.
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
  //
  // `minPerPage: 1`, not 2: the grid is `sm:grid-cols-2`, so "2" only means
  // "one row" above that breakpoint. Below it the grid is a single column, and
  // a floor of 2 would force two full-height cards to stack whether or not the
  // share of the step this box got can hold them - on a short landscape window
  // it cannot, and the overflow paints over the pager below rather than
  // clipping. A floor of 1 leaves the fit free to grow to a full row, and
  // beyond, wherever there is room; it just never forces an unfittable one.
  const {
    viewportRef,
    contentRef,
    pageItems: visiblePage,
    page,
    pageCount,
    next: nextPage,
    previous: previousPage,
  } = useFittedPage(visible, { minPerPage: 1, maxPerPage: 12 })

  // Numbered against the full list before paginating, so the badge always
  // reflects each instance's true position in the session, not its position
  // within the current page. Memoized because `useFittedPage` reads a genuine
  // change of `items` as permission to re-try a page size it had rejected,
  // and an array rebuilt on every render is not a genuine change - see that
  // hook's doc comment on what it can and cannot infer from a caller.
  const numberedItems = useMemo(
    () => items.map((item, index) => ({ item, position: index + 1 })),
    [items]
  )
  const {
    viewportRef: manifestViewportRef,
    contentRef: manifestContentRef,
    pageItems,
    page: manifestPage,
    pageCount: manifestPageCount,
    next: nextManifestPage,
    previous: previousManifestPage,
  } = useFittedPage(numberedItems, { minPerPage: 1, maxPerPage: 20 })

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 [@media(min-height:640px)]:gap-4">
      {/* A first-run explainer: the first thing a short window sheds. On a
          landscape phone it wraps to four lines and takes ~80px of a ~170px
          body - half the room the catalogue it explains has to work in. */}
      <p
        className={cn(
          "text-muted-foreground shrink-0 text-sm",
          TALL_WINDOW_ONLY
        )}
      >
        Add one or more activities to this session. The same activity can be
        added more than once - e.g. two Hangul Honeycomb blocks with different
        modes - and you will configure each one separately in the next step.
      </p>

      <div className="shrink-0">
        <ActivitySearchField
          value={query}
          onChange={setQuery}
          inputRef={searchRef}
          placeholder="Filter activities"
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground shrink-0 rounded-md border border-dashed px-3 py-6 text-center text-sm">
          No activity matches &ldquo;{query.trim()}&rdquo;
        </p>
      ) : (
        <div className={cn("flex flex-col gap-3", CATALOGUE_SHARE)}>
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
                        <div className="min-w-0 flex-1 space-y-1">
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
        </div>
      )}

      {items.length > 0 && (
        <div className={cn("flex flex-col gap-2", MANIFEST_SHARE)}>
          <p className="shrink-0 text-sm font-medium">
            Added to this session{" "}
            <span className="text-muted-foreground font-normal">
              ({items.length})
            </span>
          </p>
          <div
            ref={manifestViewportRef}
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
            <div ref={manifestContentRef} className="space-y-1.5">
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
                    <span className="min-w-0 flex-1 text-sm">
                      {activity.name}
                    </span>
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
          </div>
          <PageControls
            page={manifestPage}
            pageCount={manifestPageCount}
            onPrevious={previousManifestPage}
            onNext={nextManifestPage}
            label="added activities"
          />
        </div>
      )}
    </div>
  )
}
