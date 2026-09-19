import type { JSX } from "react"
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
import { usePresenceLease } from "@/lib/study-nudge/use-presence-lease"
import { sessionQuery, useSession } from "@/lib/tenant"
import { LivePlayer } from "@/components/player/live-player"

const PlayerSkeleton = (): JSX.Element => (
  <Card className="max-w-3xl">
    <CardContent className="space-y-4 pt-6">
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-16 w-full" />
    </CardContent>
  </Card>
)

const SessionNotFound = (): JSX.Element => (
  <Card className="max-w-3xl">
    <CardHeader>
      <CardTitle>Session not found</CardTitle>
    </CardHeader>
    <CardContent className="text-muted-foreground text-sm">
      This session may have been deleted.{" "}
      <Link to="/sessions" className="text-primary underline">
        Back to sessions
      </Link>
    </CardContent>
  </Card>
)

const DraftGuard = ({ sessionId }: { sessionId: string }): JSX.Element => (
  <Card className="max-w-3xl">
    <CardHeader>
      <CardTitle>This session hasn&apos;t been started yet</CardTitle>
    </CardHeader>
    <CardContent className="text-muted-foreground text-sm">
      Finish setting it up in the composer, then play it from there.{" "}
      <Link
        to="/sessions/new"
        search={{ edit: sessionId }}
        className="text-primary underline"
      >
        Continue editing
      </Link>
    </CardContent>
  </Card>
)

const PlayerFailure = ({
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

/** Split from `SessionPlayerRoute` so the outcome logic can be exercised
 * directly with a plain `sessionId` prop - `Route.useParams()` needs a real
 * matched router context that a component test has no reason to build. */
export const SessionPlayer = ({
  sessionId,
}: {
  sessionId: string
}): JSX.Element => {
  // The same string this route's own URL and the push notification's deep
  // link (`sessions/${id}`) carry, which is what the server compares a lease
  // against — see `usePresenceLease`.
  usePresenceLease(sessionId)
  const outcome = queryOutcome(useSession(sessionId))

  return matchQueryOutcome(outcome, {
    pending: () => <PlayerSkeleton />,
    // Distinct from `SessionNotFound`: a failed read has not told us the
    // session is absent, only that we don't yet know - see the
    // route-arrival handoff's Safety invariant.
    failed: (error, retry) => <PlayerFailure error={error} onRetry={retry} />,
    ready: (session, refreshError) => {
      if (!session) {
        // A cached "no session" through a *failed* refresh hasn't actually
        // been reconfirmed - the same Safety invariant as the `failed` arm
        // above, not "not found" wearing a different arm.
        if (refreshError) {
          return (
            <PlayerFailure
              error={refreshError.error}
              onRetry={refreshError.retry}
            />
          )
        }
        return <SessionNotFound />
      }
      if (session.status === "draft")
        return <DraftGuard sessionId={sessionId} />
      return <LivePlayer key={session.id} session={session} />
    },
  })
}

const SessionPlayerRoute = (): JSX.Element => {
  const { sessionId } = Route.useParams()
  return <SessionPlayer sessionId={String(sessionId)} />
}

export const Route = createFileRoute("/_dashboard/sessions/$sessionId")({
  // Starts the session fetch when the router starts the navigation - on hover,
  // given `defaultPreload: "intent"` - instead of after this component has
  // rendered and mounted. That ordering was the whole cost: the layout above
  // had to render before the effect below could ask for anything.
  //
  // Not awaited, and `prefetchQuery` rather than `ensureQueryData`, so this
  // stays a pure head start: navigation is never held up by a slow or failing
  // request, and `useSession` below remains the thing that decides what is on
  // screen. A prefetch that fails changes nothing - the component falls back
  // to PlayerSkeleton and then SessionNotFound exactly as it does today.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      sessionQuery(String(params.sessionId))
    )
  },
  component: SessionPlayerRoute,
})
