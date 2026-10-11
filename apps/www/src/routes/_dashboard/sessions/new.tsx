import type { JSX } from "react"
import type { ActivityId } from "@some-ui/activity-catalog"
import type { IntentError } from "@some-ui/intent-kit"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"

import { IntentFailure } from "@/lib/intent/render"
import { isOfferedActivityId } from "@/lib/playable"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import { sessionQuery, useSession } from "@/lib/tenant"
import { SessionComposer } from "@/components/composer/session-composer"

type NewSessionSearch = {
  activity?: ActivityId
  edit?: string
}

const ComposerSkeleton = (): JSX.Element => (
  <Card className="max-w-3xl">
    <CardContent className="space-y-4 pt-[var(--card-p,1.5rem)]">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-10 w-40" />
    </CardContent>
  </Card>
)

const EditSessionNotFound = (): JSX.Element => (
  <Card className="max-w-3xl">
    <CardHeader>
      <CardTitle>Draft not found</CardTitle>
    </CardHeader>
    <CardContent className="text-muted-foreground text-sm">
      This draft may have been deleted.{" "}
      <Link to="/sessions" className="text-primary underline">
        Back to sessions
      </Link>
    </CardContent>
  </Card>
)

const EditSessionFailure = ({
  error,
  onRetry,
}: {
  error: IntentError
  onRetry: () => void
}): JSX.Element => (
  <Card className="max-w-3xl">
    <CardContent className="pt-[var(--card-p,1.5rem)]">
      <IntentFailure error={error} onRetry={onRetry} />
    </CardContent>
  </Card>
)

/** Exported so tests can pass `sessionId` directly, without a matched
 * router context. */
export const EditSessionRoute = ({
  sessionId,
}: {
  sessionId: string
}): JSX.Element => {
  const outcome = queryOutcome(useSession(sessionId))

  return matchQueryOutcome(outcome, {
    pending: () => <ComposerSkeleton />,
    // Distinct from `EditSessionNotFound`: a failed read has not told us the
    // draft is absent (the route-arrival Safety invariant).
    failed: (error, retry) => (
      <EditSessionFailure error={error} onRetry={retry} />
    ),
    ready: (session, refreshError) => {
      if (!session) {
        // A cached "no draft" through a failed refresh is not reconfirmed.
        if (refreshError) {
          return (
            <EditSessionFailure
              error={refreshError.error}
              onRetry={refreshError.retry}
            />
          )
        }
        return <EditSessionNotFound />
      }
      if (!refreshError) {
        return <SessionComposer existingSession={session} />
      }
      // A cached draft through a failed refresh may be stale, so the failure
      // rides alongside it. The flex layer keeps SessionComposer (`h-full`)
      // its parent's sole height-filling child, as in `$sessionId.tsx`.
      return (
        <div className="flex h-full min-h-0 w-full max-w-3xl flex-col gap-3">
          <IntentFailure
            error={refreshError.error}
            onRetry={refreshError.retry}
          />
          <div className="min-h-0 flex-1">
            <SessionComposer existingSession={session} />
          </div>
        </div>
      )
    },
  })
}

const NewSessionRoute = (): JSX.Element => {
  const { activity, edit } = Route.useSearch()

  if (edit) return <EditSessionRoute sessionId={edit} />

  return <SessionComposer initialActivity={activity} />
}

export const Route = createFileRoute("/_dashboard/sessions/new")({
  validateSearch: (search: Record<string, unknown>): NewSessionSearch => ({
    activity: isOfferedActivityId(search.activity)
      ? search.activity
      : undefined,
    edit: typeof search.edit === "string" ? search.edit : undefined,
  }),
  // `?edit=` is what this route fetches, so the loader depends on it, or the
  // router would reuse one draft's loader result for another.
  loaderDeps: ({ search }) => ({ edit: search.edit }),
  loader: ({ context, deps }) => {
    if (!deps.edit) return
    void context.queryClient.prefetchQuery(sessionQuery(deps.edit))
  },
  component: NewSessionRoute,
})
