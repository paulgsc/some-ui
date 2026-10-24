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
    <CardContent className="space-y-4 pt-[var(--card-p,1.5rem)]">
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
    <CardContent className="pt-[var(--card-p,1.5rem)]">
      <IntentFailure error={error} onRetry={onRetry} />
    </CardContent>
  </Card>
)

/** Split from `SessionPlayerRoute` so a test can pass `sessionId` directly,
 * without a matched router context. */
export const SessionPlayer = ({
  sessionId,
  opening,
}: {
  sessionId: string
  opening?: Opening
}): JSX.Element => {
  // The same string as this route's URL and the push deep link
  // (`sessions/${id}`), which the server compares a lease against.
  usePresenceLease(sessionId)
  const outcome = queryOutcome(useSession(sessionId))

  return matchQueryOutcome(outcome, {
    pending: () => <PlayerSkeleton />,
    // Distinct from `SessionNotFound`: a failed read has not told us the
    // session is absent (the route-arrival Safety invariant).
    failed: (error, retry) => <PlayerFailure error={error} onRetry={retry} />,
    ready: (session, refreshError) => {
      if (!session) {
        // A cached "no session" through a failed refresh is not reconfirmed:
        // the same Safety invariant.
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
      // A cached session through a failed refresh may be stale, so the
      // refresh failure rides alongside it.
      const refreshBanner = refreshError && (
        <IntentFailure
          error={refreshError.error}
          onRetry={refreshError.retry}
        />
      )
      if (session.status === "draft") {
        return (
          <>
            {refreshBanner}
            <DraftGuard sessionId={sessionId} />
          </>
        )
      }
      // One tree with or without the banner: a refresh failing or recovering
      // must not remount LivePlayer, which would restart the session. Its
      // root is `h-full`, so the flex layer keeps it the sole height-filling
      // child with a banner above.
      return (
        <div className="flex h-full min-h-0 w-full flex-col gap-3">
          {refreshBanner}
          <div className="min-h-0 flex-1">
            <LivePlayer
              key={session.id}
              session={session}
              {...(opening ? { initialOpening: opening } : {})}
            />
          </div>
        </div>
      )
    },
  })
}

const SessionPlayerRoute = (): JSX.Element => {
  const { sessionId } = Route.useParams()
  const { open } = Route.useSearch()
  return (
    <SessionPlayer
      sessionId={String(sessionId)}
      {...(open ? { opening: open } : {})}
    />
  )
}

/** Where the lesson opens: Topik's `opening`. */
type Opening = "next" | "menu"

/**
 * `?open=next` or `?open=menu`: Practice Home's "Next lesson" or "Pick a
 * portion" made this session, so it plays at once and opens there. `?next=
 * true` is what "Next lesson" sent before there were two.
 */
const openOf = (search: Record<string, unknown>): Opening | undefined =>
  search.open === "next" || search.open === "menu"
    ? search.open
    : search.next === true
      ? "next"
      : undefined

export const Route = createFileRoute("/_dashboard/sessions/$sessionId")({
  validateSearch: (search: Record<string, unknown>): { open?: Opening } => {
    const open = openOf(search)
    return open ? { open } : {}
  },
  // Starts the session fetch when navigation starts (on hover, via
  // `defaultPreload: "intent"`) rather than after mount. Not awaited, and
  // `prefetchQuery` not `ensureQueryData`: a pure head start that never
  // holds navigation up; `useSession` still decides what is shown.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      sessionQuery(String(params.sessionId))
    )
  },
  component: SessionPlayerRoute,
})
