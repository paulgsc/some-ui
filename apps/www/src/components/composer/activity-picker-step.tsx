import type { JSX } from "react"
import { useMemo, useRef } from "react"
import type { ActivityDefinition, ActivityId } from "@some-ui/activity-catalog"
import { getActivity, searchActivities } from "@some-ui/activity-catalog"
import { cn } from "@some-ui/core-utils"
import { useFittedPage } from "@some-ui/react-hooks"
import {
  Badge,
  Button,
  Card,
  CardContent,
  PageControls,
  TALL_WINDOW_ONLY,
} from "@some-ui/shared"
import { Plus, X } from "lucide-react"

import { OFFERED_ACTIVITIES } from "@/lib/playable"
import { ActivityIcon } from "@/components/activity-icon"
import { ActivityInputHint } from "@/components/activity/activity-input"
import { ActivityMaturityBadge } from "@/components/activity/activity-maturity"
import {
  ActivitySearchField,
  useSearchHotkey,
} from "@/components/activity/activity-search-field"
import { AudioActivityHint } from "@/components/audio/audio-activity-notice"

/**
 * How the step's height is split between its two lists: the catalogue (what
 * the step is for) gets the larger share, the manifest the rest. Shares of
 * the wizard's body, not fixed heights, so they fit every window.
 */
const CATALOGUE_SHARE = "min-h-0 flex-[3]"
const MANIFEST_SHARE = "min-h-0 flex-[2]"

/** What this build offers: only activities whose panel it binds. */
const CATALOGUE: ReadonlyArray<ActivityDefinition> = OFFERED_ACTIVITIES

type PickedActivity = {
  instanceId: string
  activityId: ActivityId
}

/**
 * Which half of the picker to show. A wide screen shows both in one step; a
 * phone gives each a pane of its own (`./panes`).
 */
type PickerSection = "both" | "catalogue" | "manifest"

type ActivityPickerStepProps = {
  items: ReadonlyArray<PickedActivity>
  onAdd: (id: ActivityId) => void
  onRemove: (instanceId: string) => void
  section?: PickerSection
  /** Where the manifest's empty state sends someone who has added nothing. */
  onBrowse?: () => void
  /**
   * The catalogue's search, held by the composer: each layout mounts this
   * component in a different place, so its own state is lost when the window
   * crosses `md`.
   */
  query: string
  onQueryChange: (query: string) => void
}

/**
 * The composer's picker: the whole catalogue, paged (#856). Someone composing
 * a session wants to see what exists, not a recommendation. Search narrows
 * the catalogue; the pager walks whatever is left. Both lists are fitted to
 * shares of the step's height, since a constant page size is right at only
 * one window.
 */
export const ActivityPickerStep = ({
  items,
  onAdd,
  onRemove,
  section = "both",
  onBrowse,
  query,
  onQueryChange,
}: ActivityPickerStepProps): JSX.Element => {
  const showCatalogue = section !== "manifest"
  const showManifest = section !== "catalogue"
  // Alone in its pane a half takes all of it; shared, the catalogue gets the
  // larger part (see the two constants above).
  const catalogueShare = showManifest ? CATALOGUE_SHARE : "min-h-0 flex-1"
  const manifestShare = showCatalogue ? MANIFEST_SHARE : "min-h-0 flex-1"

  const searchRef = useRef<HTMLInputElement>(null)
  // A manifest-only pane has no field to focus, and `/` there would be
  // swallowed (`preventDefault`) for nothing.
  useSearchHotkey(searchRef, showCatalogue)

  const countsById = new Map<ActivityId, number>()
  for (const item of items) {
    countsById.set(item.activityId, (countsById.get(item.activityId) ?? 0) + 1)
  }

  // An empty query is "no search": `searchActivities` returns nothing for one
  // on purpose.
  const visible = useMemo(
    () =>
      query.trim().length > 0
        ? searchActivities(CATALOGUE, query, { limit: CATALOGUE.length })
        : CATALOGUE,
    [query]
  )

  // Fitted, not a constant page size: card height varies (a maturity note, an
  // audio hint). Destructured because react-hooks/refs reads any property
  // access on the returned object as a ref read during render.
  //
  // `minPerPage: 1`, not 2: below `sm` the grid is one column, and a floor of
  // 2 would force two full-height cards onto a short landscape window, where
  // the overflow paints over the pager.
  const {
    viewportRef,
    contentRef,
    pageItems: visiblePage,
    page,
    pageCount,
    next: nextPage,
    previous: previousPage,
  } = useFittedPage(visible, { minPerPage: 1, maxPerPage: 12 })

  // Numbered against the full list before paginating, so the badge shows the
  // instance's position in the session. Memoized because `useFittedPage`
  // reads a new `items` array as permission to retry a rejected page size.
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
      {showCatalogue && (
        <>
          {/* A first-run explainer: the first thing a short window sheds (on
          a landscape phone it would take half the catalogue's room). */}
          <p
            className={cn(
              "text-muted-foreground shrink-0 text-sm",
              TALL_WINDOW_ONLY
            )}
          >
            Add one or more activities to this session. The same activity can be
            added more than once - e.g. two Hangul Honeycomb blocks with
            different modes - and you will configure each one separately in the
            next step.
          </p>

          <div className="shrink-0">
            <ActivitySearchField
              value={query}
              onChange={onQueryChange}
              inputRef={searchRef}
              placeholder="Filter activities"
            />
          </div>

          {visible.length === 0 ? (
            <p className="text-muted-foreground shrink-0 rounded-md border border-dashed px-3 py-6 text-center text-sm">
              No activity matches &ldquo;{query.trim()}&rdquo;
            </p>
          ) : (
            <div className={cn("flex flex-col gap-3", catalogueShare)}>
              <div
                ref={viewportRef}
                data-scroll-intent="fitted-residue"
                className={
                  // scroll-intent: fitted-residue — `useFittedPage` makes the
                  // content fit, except a single item taller than the whole box
                  // at `minPerPage` (see the hook's Options doc). This is where
                  // that residue scrolls; clipping it would make a card whose
                  // centre falls outside unclickable. The bar is hidden on a
                  // handheld, which scrolls by finger.
                  "min-h-0 flex-1 overflow-y-auto handheld:no-scrollbar"
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
                          <CardContent className="flex items-start gap-3 pt-[var(--card-p,1.5rem)]">
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
                              {/* Said while still choosing, so neither the
                              audio nor the input it asks for is a surprise. */}
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

              {/* Paging the catalogue does not touch `items`, so adding from
              page 3 stays on page 3. */}
              <PageControls
                page={page}
                pageCount={pageCount}
                onPrevious={previousPage}
                onNext={nextPage}
                label="activities"
              />
            </div>
          )}
        </>
      )}

      {showManifest && items.length > 0 && (
        <div className={cn("flex flex-col gap-2", manifestShare)}>
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
              // scroll-intent: fitted-residue — see the catalogue box above.
              "min-h-0 flex-1 overflow-y-auto handheld:no-scrollbar"
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

      {section === "manifest" && items.length === 0 && (
        <div className="text-muted-foreground flex flex-col items-start gap-3 rounded-md border border-dashed px-3 py-6 text-sm">
          <p>
            Nothing added yet. Browse the activities and tap one to add it to
            this session.
          </p>
          {onBrowse && (
            <Button type="button" variant="outline" onClick={onBrowse}>
              Browse activities
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
