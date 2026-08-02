import type { JSX } from "react"
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

import { ACTIVITY_CATALOG, ACTIVITY_IDS } from "@some-ui/activity-catalog"
import type { ActivityId } from "@some-ui/activity-catalog"
import type { SessionRecord, SessionStatus } from "@/lib/tenant"
import { useProfile, useSessions } from "@/lib/tenant"
import { ActivityIcon } from "@/components/activity-icon"
import {
  ActivityMaturityBadge,
  ActivityMaturityNote,
} from "@/components/activity/activity-maturity"
import { AudioActivityHint } from "@/components/audio/audio-activity-notice"

const STATUS_LABEL: Record<SessionStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "In progress",
  paused: "Paused",
  completed: "Completed",
}

const RESUMABLE_STATUSES: ReadonlyArray<SessionStatus> = ["active", "paused"]

const ProfileSummary = (): JSX.Element => {
  const { data: profile, isLoading } = useProfile()

  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        {isLoading || !profile ? (
          <>
            <Skeleton className="size-12 rounded-full" />
            <Skeleton className="h-5 w-32" />
          </>
        ) : (
          <>
            <Avatar className="size-12 text-2xl">
              <AvatarFallback>{profile.avatar}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-muted-foreground text-sm">Welcome back</p>
              <p className="text-lg font-semibold">{profile.displayName}</p>
            </div>
          </>
        )}
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

const ActivityQuickLaunch = (): JSX.Element => {
  return (
    <section className="space-y-3">
      <h2 className="text-gradient-heading text-lg font-semibold">
        Start something new
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIVITY_IDS.map((id: ActivityId) => {
          const activity = ACTIVITY_CATALOG[id]
          return (
            <Link
              key={id}
              to="/sessions/new"
              search={{ activity: id }}
              className="block"
            >
              <Card className="hover:border-primary/50 h-full transition-colors">
                <CardContent className="flex flex-col gap-2 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <ActivityIcon
                      icon={activity.icon}
                      className="text-primary size-6"
                    />
                    {/* Said before the click, where the expectation is set -
                        not after, where the disappointment lands. */}
                    <ActivityMaturityBadge activity={activity} />
                  </div>
                  <p className="font-semibold">{activity.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {activity.description}
                  </p>
                  <ActivityMaturityNote activity={activity} />
                  <AudioActivityHint activity={activity} />
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

const RecentSessions = ({
  sessions,
}: {
  sessions: Array<SessionRecord>
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

const DashboardHome = (): JSX.Element => {
  const { data: sessions = [] } = useSessions()
  const resumableSession = sessions.find((s) =>
    RESUMABLE_STATUSES.includes(s.status)
  )

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <ProfileSummary />
      {resumableSession && <ContinueSessionCard session={resumableSession} />}
      <ActivityQuickLaunch />
      <RecentSessions sessions={sessions} />
    </div>
  )
}

export const Route = createFileRoute("/_dashboard/app")({
  component: DashboardHome,
})
