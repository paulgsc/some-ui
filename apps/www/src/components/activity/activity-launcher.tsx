import type { JSX } from "react"
import { useId, useMemo, useRef } from "react"
import type { ActivityDefinition } from "@some-ui/activity-catalog"
import { pickRecommended } from "@some-ui/activity-catalog"
import { cn } from "@some-ui/core-utils"
import { Button, Card, CardContent } from "@some-ui/shared"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowRight, SearchX } from "lucide-react"

import { OFFERED_ACTIVITIES as CATALOGUE } from "@/lib/playable"
import { useProfile, useSessions } from "@/lib/tenant"
import { useRecommendedCount } from "@/hooks/use-recommended-count"
import { ActivityIcon } from "@/components/activity-icon"
import { ActivityLaunchCard } from "@/components/activity/activity-launch-card"
import { ActivityMaturityBadge } from "@/components/activity/activity-maturity"
import {
  ActivitySearchField,
  useSearchHotkey,
} from "@/components/activity/activity-search-field"

import { playsFromSessions } from "./launch-signals"
import { useSearchOverlay } from "./use-search-overlay"

/**
 * The dashboard's front door: `k` recommended activities, and search for
 * everything else (#854, #855). It never renders the whole catalogue (a wall
 * at twenty activities, and `overflow-y-auto` is banned here). `k` depends on
 * the box (one row per breakpoint), never the catalogue.
 */
export const ActivityLauncher = (): JSX.Element => {
  const { data: sessions = [] } = useSessions()
  const { data: profile } = useProfile()
  const k = useRecommendedCount()
  const navigate = useNavigate()

  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()
  useSearchHotkey(inputRef)

  // Ranked once, in full: the launcher shows the head, the overlay searches
  // all of it.
  const ranked = useMemo(
    () =>
      pickRecommended(CATALOGUE, CATALOGUE.length, {
        history: playsFromSessions(sessions),
        targetLevel: profile?.targetTopikLevel,
      }),
    [sessions, profile?.targetTopikLevel]
  )

  const launch = (activity: ActivityDefinition): void => {
    void navigate({ to: "/sessions/new", search: { activity: activity.id } })
  }

  const overlay = useSearchOverlay({ catalogue: ranked, onLaunch: launch })
  const recommended = ranked.slice(0, k)
  const optionId = (activity: ActivityDefinition): string =>
    `${listboxId}-${activity.id}`

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-gradient-heading text-lg font-semibold">
          Start something new
        </h2>
        <Button asChild variant="ghost" size="sm">
          {/* Nothing is unreachable while the launcher shows k of N: the
              composer's picker pages the whole catalogue (#856). */}
          <Link to="/sessions/new">
            Browse all <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
      </div>

      {/* The results panel is positioned against this wrapper, so opening
            it moves nothing underneath. */}
      <div className="relative">
        <ActivitySearchField
          value={overlay.query}
          onChange={overlay.setQuery}
          onKeyDown={overlay.handleKeyDown}
          inputRef={inputRef}
          controls={{
            listboxId,
            activeOptionId: overlay.active
              ? optionId(overlay.active)
              : undefined,
            expanded: overlay.isOpen,
          }}
        />

        {overlay.isOpen && (
          <div className="bg-popover absolute inset-x-0 top-full z-20 mt-1 rounded-md border shadow-md">
            {overlay.results.length === 0 ? (
              <p className="text-muted-foreground flex items-center gap-2 px-3 py-4 text-sm">
                <SearchX className="size-4 shrink-0" />
                No activity matches &ldquo;{overlay.query.trim()}&rdquo;
              </p>
            ) : (
              <ul id={listboxId} role="listbox" aria-label="Search results">
                {overlay.results.map((activity, index) => (
                  <li key={activity.id} role="presentation">
                    <button
                      type="button"
                      id={optionId(activity)}
                      role="option"
                      aria-selected={index === overlay.activeIndex}
                      onClick={() => launch(activity)}
                      onMouseEnter={() => overlay.setActiveIndex(index)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left",
                        index === overlay.activeIndex &&
                          "bg-accent text-accent-foreground"
                      )}
                    >
                      <ActivityIcon
                        icon={activity.icon}
                        className="text-primary size-4 shrink-0"
                      />
                      <span className="truncate text-sm font-medium">
                        {activity.name}
                      </span>
                      <span className="text-muted-foreground hidden truncate text-xs sm:inline">
                        {activity.description}
                      </span>
                      <ActivityMaturityBadge activity={activity} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {recommended.map((activity) => (
          <ActivityLaunchCard key={activity.id} activity={activity} />
        ))}
      </div>

      {recommended.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-center text-sm">
            No activities are available yet.
          </CardContent>
        </Card>
      )}
    </section>
  )
}
