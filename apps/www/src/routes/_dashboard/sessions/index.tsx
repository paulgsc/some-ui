import type { JSX } from "react"
import { useState } from "react"
import { findActivity, summarizeConfig } from "@some-ui/activity-catalog"
import type { Intent, IntentError } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import {
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Copy, Pencil, Play, Sparkles, Trash2, X } from "lucide-react"
import { cn, formatRelativeTime } from "some-ui-utils"

import { MOBILE_APP } from "@/lib/build-profile"
import { useIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton, IntentFailure } from "@/lib/intent/render"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import type { SessionRecord, SessionStatus } from "@/lib/tenant"
import {
  sessionsQuery,
  useDeleteManySessions,
  useDeleteSession,
  useDuplicateSession,
  useSessions,
  useUpdateStatusManySessions,
} from "@/lib/tenant"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationControls } from "@/components/pagination-controls"

const STATUS_LABEL: Record<SessionStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "In progress",
  paused: "Paused",
  completed: "Completed",
}

function badgeVariantFor(
  status: SessionStatus
): "default" | "secondary" | "outline" {
  if (status === "active") return "default"
  if (status === "paused" || status === "scheduled") return "secondary"
  return "outline"
}

const SessionsSkeleton = (): JSX.Element => (
  <div className="space-y-3">
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-20 w-full" />
  </div>
)

const SessionCard = ({
  session,
  isSelected,
  onToggleSelected,
}: {
  session: SessionRecord
  isSelected: boolean
  onToggleSelected: (id: string) => void
}): JSX.Element => {
  const duplicateIntent = useIntent(useDuplicateSession(), {
    presentation: "interactive",
  })
  const deleteIntent = useIntent(useDeleteSession(), {
    presentation: "interactive",
  })

  const handleDuplicate = (): void => {
    duplicateIntent.start(session.id)
  }

  const handleDelete = (): void => {
    if (confirm(`Delete "${session.name}"? This cannot be undone.`)) {
      deleteIntent.start(session.id)
    }
  }

  const primaryAction =
    session.status === "draft" ? (
      <Button asChild size="sm">
        <Link to="/sessions/new" search={{ edit: session.id }}>
          <Pencil className="mr-1.5 size-3.5" />
          Edit
        </Link>
      </Button>
    ) : session.status === "completed" ? (
      <Button asChild size="sm" variant="outline">
        <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>
          View summary
        </Link>
      </Button>
    ) : (
      <Button asChild size="sm">
        <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>
          <Play className="mr-1.5 size-3.5" />
          Resume
        </Link>
      </Button>
    )

  return (
    <Card className={cn(isSelected && "border-primary ring-primary/50 ring-1")}>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3 sm:flex-1 sm:items-center">
          <input
            type="checkbox"
            className="accent-primary mt-1 size-4 shrink-0 sm:mt-0"
            checked={isSelected}
            onChange={() => onToggleSelected(session.id)}
            aria-label={`Select "${session.name}"`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{session.name}</p>
              <Badge
                variant={badgeVariantFor(session.status)}
                className="whitespace-nowrap"
              >
                {STATUS_LABEL[session.status]}
              </Badge>
            </div>
            {/* One tag per activity config (summarizeConfig), so two drafts
                  of one activity are distinguishable. */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {session.activities.map((sessionActivity, index) => {
                const activity = findActivity(sessionActivity.activityId)
                // A retired activity has nothing left to summarize.
                if (!activity) return null
                return (
                  <Badge
                    // eslint-disable-next-line react/no-array-index-key -- position within one session's fixed activity list is a stable identity here; the same activityId can repeat within a session
                    key={`${sessionActivity.activityId}-${index}`}
                    variant="outline"
                    className="text-muted-foreground max-w-full truncate font-normal"
                  >
                    {activity.name}:{" "}
                    {summarizeConfig(activity, sessionActivity.config)}
                  </Badge>
                )
              })}
            </div>
            <p className="text-muted-foreground mt-1 hidden text-xs sm:block">
              Updated {formatRelativeTime(session.updatedAt)}
            </p>
          </div>
        </div>
        {/* On a phone the actions drop below the details, with "Updated"
              in their row. */}
        <div className="flex shrink-0 items-center gap-2 sm:self-auto">
          <p className="text-muted-foreground mr-auto min-w-0 truncate pl-7 text-xs sm:hidden">
            Updated {formatRelativeTime(session.updatedAt)}
          </p>
          {primaryAction}
          <IntentButton
            state={duplicateIntent.state}
            onPress={handleDuplicate}
            size="sm"
            variant="ghost"
            title="Duplicate"
            idleLabel={<Copy className="size-3.5" />}
            workingLabel={<Copy className="size-3.5" />}
          />
          <IntentButton
            state={deleteIntent.state}
            onPress={handleDelete}
            size="sm"
            variant="ghost"
            title="Delete"
            className="text-destructive hover:text-destructive"
            idleLabel={<Trash2 className="size-3.5" />}
            workingLabel={<Trash2 className="size-3.5" />}
          />
        </div>
      </CardContent>
    </Card>
  )
}

/** Sessions per page, per section - each section (In progress/Drafts/Completed) paginates independently. */
const SESSIONS_PAGE_SIZE = 10

const SessionSection = ({
  title,
  sessions,
  selectedIds,
  onToggleSelected,
}: {
  title: string
  sessions: Array<SessionRecord>
  selectedIds: ReadonlySet<string>
  onToggleSelected: (id: string) => void
}): JSX.Element | null => {
  const { pageItems, currentPage, totalPages, goToPreviousPage, goToNextPage } =
    usePagination(sessions, SESSIONS_PAGE_SIZE)

  if (sessions.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        {title}{" "}
        <span className="text-muted-foreground">({sessions.length})</span>
      </h2>
      <div className="space-y-2">
        {pageItems.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            isSelected={selectedIds.has(session.id)}
            onToggleSelected={onToggleSelected}
          />
        ))}
      </div>
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        onPrevious={goToPreviousPage}
        onNext={goToNextPage}
      />
    </section>
  )
}

const BULK_STATUS_OPTIONS: ReadonlyArray<SessionStatus> = [
  "draft",
  "scheduled",
  "paused",
  "completed",
]

function isBulkStatus(value: string): value is SessionStatus {
  return BULK_STATUS_OPTIONS.some((status) => status === value)
}

function isIntentPending<T>(state: Intent<T>): boolean {
  return matchIntent(state, {
    idle: () => false,
    working: () => true,
    succeeded: () => false,
    failed: () => false,
  })
}

/** Named, not an inline arrow, for `react/no-unstable-nested-components`.
 * Status changes fire from a `Select`, with no button to retry through, so
 * `IntentFailure`'s own retry control is rendered directly. */
function bulkStatusChangeFailure(
  state: Intent<Array<SessionRecord>>
): JSX.Element | null {
  return matchIntent(state, {
    idle: () => null,
    working: () => null,
    succeeded: () => null,
    failed: (error, retry) => <IntentFailure error={error} onRetry={retry} />,
  })
}

const BulkActionBar = ({
  selectedIds,
  onClearSelection,
}: {
  selectedIds: ReadonlySet<string>
  onClearSelection: () => void
}): JSX.Element => {
  const deleteManyIntent = useIntent(useDeleteManySessions(), {
    presentation: "interactive",
  })
  const updateStatusManyIntent = useIntent(useUpdateStatusManySessions(), {
    presentation: "interactive",
  })
  const ids = [...selectedIds]
  const isBusy =
    isIntentPending(deleteManyIntent.state) ||
    isIntentPending(updateStatusManyIntent.state)

  // Decoupled from `.start()` (`lib/intent/render/index.ts`): a *successful*
  // batch clears the selection, once.
  useIntentEffect(deleteManyIntent.state, onClearSelection)
  useIntentEffect(updateStatusManyIntent.state, onClearSelection)

  const handleDeleteSelected = (): void => {
    if (
      confirm(
        `Delete ${ids.length} session${ids.length === 1 ? "" : "s"}? This cannot be undone.`
      )
    ) {
      deleteManyIntent.start(ids)
    }
  }

  const handleStatusChange = (status: string): void => {
    if (!isBulkStatus(status)) return
    updateStatusManyIntent.start({ ids, status })
  }

  return (
    <div className="bg-muted/50 sticky top-0 z-10 flex flex-col gap-2 rounded-lg border px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{ids.length} selected</span>
        <Select onValueChange={handleStatusChange} disabled={isBusy}>
          <SelectTrigger className="h-8 w-[160px]">
            <SelectValue placeholder="Set status to..." />
          </SelectTrigger>
          <SelectContent>
            {BULK_STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <IntentButton
          state={deleteManyIntent.state}
          onPress={handleDeleteSelected}
          size="sm"
          variant="outline"
          disabled={isIntentPending(updateStatusManyIntent.state)}
          className="text-destructive hover:text-destructive"
          idleLabel={
            <>
              <Trash2 className="mr-1.5 size-3.5" />
              Delete
            </>
          }
          workingLabel="Deleting..."
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={onClearSelection}
          disabled={isBusy}
          className="ml-auto"
        >
          <X className="mr-1.5 size-3.5" />
          Clear selection
        </Button>
      </div>
      {bulkStatusChangeFailure(updateStatusManyIntent.state)}
    </div>
  )
}

const IN_PROGRESS_STATUSES: ReadonlyArray<SessionStatus> = [
  "active",
  "paused",
  "scheduled",
]

const SessionsList = ({
  sessions,
  refreshError,
}: {
  sessions: Array<SessionRecord>
  refreshError?: { error: IntentError; retry: () => void }
}): JSX.Element => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const handleToggleSelected = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleClearSelection = (): void => {
    setSelectedIds(new Set())
  }

  if (sessions.length === 0) {
    return (
      <div className="max-w-3xl space-y-4">
        {/* See the nonempty branch below's identical comment - an empty
            cache is not exempt from the same stale/failure signal. */}
        {refreshError && (
          <IntentFailure
            error={refreshError.error}
            onRetry={refreshError.retry}
          />
        )}
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <Sparkles className="size-6" />
            <p>No sessions yet.</p>
            <Button asChild size="sm" className="mt-2">
              {/* Home's launcher is the web app's; the phone goes straight
                  to the composer, whose picker has the whole catalogue. */}
              <Link to={MOBILE_APP ? "/sessions/new" : "/app"}>
                Start something new
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const byRecency = [...sessions].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  )
  const inProgress = byRecency.filter((s) =>
    IN_PROGRESS_STATUSES.includes(s.status)
  )
  const drafts = byRecency.filter((s) => s.status === "draft")
  const completed = byRecency.filter((s) => s.status === "completed")

  return (
    <div className="max-w-3xl space-y-8">
      {/* A cached list stays on screen through a failed refresh
            (query-outcome's header); this banner says so. */}
      {refreshError && (
        <IntentFailure
          error={refreshError.error}
          onRetry={refreshError.retry}
        />
      )}
      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          onClearSelection={handleClearSelection}
        />
      )}
      <SessionSection
        title="In progress"
        sessions={inProgress}
        selectedIds={selectedIds}
        onToggleSelected={handleToggleSelected}
      />
      <SessionSection
        title="Drafts"
        sessions={drafts}
        selectedIds={selectedIds}
        onToggleSelected={handleToggleSelected}
      />
      <SessionSection
        title="Completed"
        sessions={completed}
        selectedIds={selectedIds}
        onToggleSelected={handleToggleSelected}
      />
    </div>
  )
}

const SessionsOutcome = (): JSX.Element => {
  const outcome = queryOutcome(useSessions())

  return matchQueryOutcome(outcome, {
    pending: () => <SessionsSkeleton />,
    failed: (error, retry) => <IntentFailure error={error} onRetry={retry} />,
    ready: (sessions, refreshError) => (
      <SessionsList sessions={sessions} refreshError={refreshError} />
    ),
  })
}

const SessionsRoute = (): JSX.Element => <SessionsOutcome />

export const Route = createFileRoute("/_dashboard/sessions/")({
  // See `$sessionId.tsx`'s loader for why this is a non-awaited prefetch and
  // not `ensureQueryData`: a head start, never a gate.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(sessionsQuery)
  },
  component: SessionsRoute,
})
