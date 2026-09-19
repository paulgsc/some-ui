import type { JSX } from "react"
import { ACTIVITY_IDS } from "@some-ui/activity-catalog"
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
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import { sessionQuery, useSession } from "@/lib/tenant"
import { SessionComposer } from "@/components/composer/session-composer"

type NewSessionSearch = {
  activity?: ActivityId
  edit?: string
}

function isActivityId(value: unknown): value is ActivityId {
  return typeof value === "string" && ACTIVITY_IDS.some((id) => id === value)
}

const ComposerSkeleton = (): JSX.Element => (
  <Card className="max-w-3xl">
    <CardContent className="space-y-4 pt-6">
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
    <CardContent className="pt-6">
      <IntentFailure error={error} onRetry={onRetry} />
    </CardContent>
  </Card>
)

/** Exported so tests can drive the outcome logic with a plain `sessionId`
 * prop - `Route.useSearch()` needs a real matched router context that a
 * component test has no reason to build. */
export const EditSessionRoute = ({
  sessionId,
}: {
  sessionId: string
}): JSX.Element => {
  const outcome = queryOutcome(useSession(sessionId))

  return matchQueryOutcome(outcome, {
    pending: () => <ComposerSkeleton />,
    // Distinct from `EditSessionNotFound`: a failed read has not told us the
    // draft is absent, only that we don't yet know - see the route-arrival
    // handoff's Safety invariant.
    failed: (error, retry) => (
      <EditSessionFailure error={error} onRetry={retry} />
    ),
    ready: (session, refreshError) => {
      if (!session) {
        // A cached "no draft" through a *failed* refresh hasn't actually
        // been reconfirmed - the same Safety invariant as the `failed` arm
        // above, not "not found" wearing a different arm.
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
      // Same Safety invariant as the null-session branch above, for a
      // cached *non-null* draft: the composer may be editing stale data,
      // so the refresh failure rides alongside it rather than being
      // silently dropped - a bot review caught this arm handling only the
      // null case. SessionComposer's own root is `h-full`, so the extra
      // flex layer here (mirroring `$sessionId.tsx`'s identical fix) keeps
      // it the sole height-filling child of its parent.
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
    activity: isActivityId(search.activity) ? search.activity : undefined,
    edit: typeof search.edit === "string" ? search.edit : undefined,
  }),
  // `?edit=` is what this route fetches, so it is what the loader has to
  // depend on: without `loaderDeps` the router would reuse one navigation's
  // loader result for a different draft. A bare /sessions/new fetches nothing
  // — there is no existing session to prefetch.
  loaderDeps: ({ search }) => ({ edit: search.edit }),
  loader: ({ context, deps }) => {
    if (!deps.edit) return
    void context.queryClient.prefetchQuery(sessionQuery(deps.edit))
  },
  component: NewSessionRoute,
})
