import type { JSX } from "react"
import type { IntentError } from "@some-ui/intent-kit"
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  Skeleton,
} from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, Play, Sparkles } from "lucide-react"
import { formatRelativeTime } from "some-ui-utils"

import { IntentFailure } from "@/lib/intent/render"
import type { QueryOutcome } from "@/lib/query-outcome"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import type { SessionRecord, SessionStatus, UserProfile } from "@/lib/tenant"
import {
  profileQuery,
  sessionsQuery,
  useProfile,
  useSessions,
} from "@/lib/tenant"
import { ActivityLauncher } from "@/components/activity/activity-launcher"

const STATUS_LABEL: Record<SessionStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "In progress",
  paused: "Paused",
  completed: "Completed",
}

const RESUMABLE_STATUSES: ReadonlyArray<SessionStatus> = ["active", "paused"]

/** A named function, not an inline arrow embedded in `ProfileSummary`'s own
 * JSX - the latter trips `react/no-unstable-nested-components` the moment
 * an enclosing component returns a JSX literal directly (see
 * `sessions/index.tsx`'s identical `bulkStatusChangeFailure` precedent). A
 * lowercase-initial name is what exempts it: the rule only reports against
 * a PascalCase parent. */
function profileSummaryContent(
  outcome: QueryOutcome<UserProfile>
): JSX.Element {
  return matchQueryOutcome(outcome, {
    pending: () => (
      <>
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="h-5 w-32" />
      </>
    ),
    failed: (error, retry) => (
      <IntentFailure
        error={error}
        onRetry={retry}
        className="min-w-0 flex-1 py-1.5"
      />
    ),
    ready: (profile, refreshError) => (
      <>
        <Avatar className="size-12 text-2xl">
          <AvatarFallback>{profile.avatar}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-muted-foreground text-sm">Welcome back</p>
          <p className="text-lg font-semibold">{profile.displayName}</p>
        </div>
        {/* Same Safety invariant `RecentSessions` below already gets right:
            a cached profile through a failed background refresh may be
            stale, so the refresh failure rides alongside it rather than
            being silently discarded - this arm shared the gap `profile.tsx`/
            `settings.tsx` had until a bot review caught it there first. */}
        {refreshError && (
          <IntentFailure
            error={refreshError.error}
            onRetry={refreshError.retry}
            className="min-w-0 flex-1 py-1.5"
          />
        )}
      </>
    ),
  })
}

const ProfileSummary = (): JSX.Element => {
  const outcome = queryOutcome(useProfile())

  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        {profileSummaryContent(outcome)}
        <Button asChild variant="outline" className="ml-auto">
          <Link to="/profile">Edit profile</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

const ContinueSessionCard = ({
  session,
}: {
  session: SessionRecord
}): JSX.Element => {
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex items-center gap-4 pt-6">
        <div className="bg-primary/10 flex size-12 items-center justify-center rounded-full">
          <Play className="text-primary size-5" />
        </div>
        <div className="flex-1">
          <p className="text-muted-foreground text-sm">
            {STATUS_LABEL[session.status]} session
          </p>
          <p className="font-semibold">{session.name}</p>
        </div>
        <Button asChild>
          <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>
            Resume
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

const RecentSessionsSkeleton = (): JSX.Element => (
  <section className="space-y-3">
    <h2 className="text-gradient-heading text-lg font-semibold">
      Recent sessions
    </h2>
    <div className="space-y-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  </section>
)

const RecentSessionsFailure = ({
  error,
  onRetry,
}: {
  error: IntentError
  onRetry: () => void
}): JSX.Element => (
  <section className="space-y-3">
    <h2 className="text-gradient-heading text-lg font-semibold">
      Recent sessions
    </h2>
    <IntentFailure error={error} onRetry={onRetry} />
  </section>
)

const RecentSessions = ({
  sessions,
  refreshError,
}: {
  sessions: Array<SessionRecord>
  refreshError?: { error: IntentError; retry: () => void }
}): JSX.Element => {
  const recent = [...sessions]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-gradient-heading text-lg font-semibold">
          Recent sessions
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link to="/sessions">
            View all <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
      </div>

      {/* See query-outcome's header: a cached list stays on screen while its
          own background refresh failed, distinguished from an authoritative
          empty/error state by this banner rather than by silently dropping
          content. */}
      {refreshError && (
        <IntentFailure
          error={refreshError.error}
          onRetry={refreshError.retry}
        />
      )}

      {recent.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <Sparkles className="size-6" />
            <p>No sessions yet - pick an activity above to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {recent.map((session) => (
            <Link
              key={session.id}
              to="/sessions/$sessionId"
              params={{ sessionId: session.id }}
              className="block"
            >
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{session.name}</p>
                    <p className="text-muted-foreground text-xs">
                      Updated {formatRelativeTime(session.updatedAt)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {STATUS_LABEL[session.status]}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

/** See `profileSummaryContent`'s identical comment on why this is a named,
 * lowercase-initial function rather than an inline arrow. */
function recentSessionsContent(
  outcome: QueryOutcome<Array<SessionRecord>>
): JSX.Element {
  return matchQueryOutcome(outcome, {
    pending: () => <RecentSessionsSkeleton />,
    failed: (error, retry) => (
      <RecentSessionsFailure error={error} onRetry={retry} />
    ),
    ready: (sessions, refreshError) => (
      <RecentSessions sessions={sessions} refreshError={refreshError} />
    ),
  })
}

function findResumableSession(
  outcome: QueryOutcome<Array<SessionRecord>>
): SessionRecord | undefined {
  return matchQueryOutcome(outcome, {
    pending: () => undefined,
    failed: () => undefined,
    ready: (sessions) =>
      sessions.find((s) => RESUMABLE_STATUSES.includes(s.status)),
  })
}

const DashboardHome = (): JSX.Element => {
  const outcome = queryOutcome(useSessions())
  const resumableSession = findResumableSession(outcome)

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <ProfileSummary />
      {resumableSession && <ContinueSessionCard session={resumableSession} />}
      <ActivityLauncher />
      {recentSessionsContent(outcome)}
    </div>
  )
}

export const Route = createFileRoute("/_dashboard/app")({
  // Both of this route's queries, started together. `ProfileSummary` and
  // `RecentSessions` are siblings, so their two requests were already
  // concurrent with each other - what they were waiting on was this component
  // rendering at all. See `$sessionId.tsx`'s loader for the prefetch rationale.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(profileQuery)
    void context.queryClient.prefetchQuery(sessionsQuery)
  },
  component: DashboardHome,
})
