import type { JSX } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Copy, Pencil, Play, Sparkles, Trash2 } from "lucide-react"
import { Badge, Button, Card, CardContent, Skeleton } from "some-ui-shared"
import { formatRelativeTime } from "some-ui-utils"

import type { SessionRecord, SessionStatus } from "@/lib/tenant"
import {
  useDeleteSession,
  useDuplicateSession,
  useSessions,
} from "@/lib/tenant"

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

const SessionCard = ({ session }: { session: SessionRecord }): JSX.Element => {
  const duplicateSession = useDuplicateSession()
  const deleteSession = useDeleteSession()

  const handleDuplicate = (): void => {
    duplicateSession.mutate(session.id)
  }

  const handleDelete = (): void => {
    if (confirm(`Delete "${session.name}"? This cannot be undone.`)) {
      deleteSession.mutate(session.id)
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
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{session.name}</p>
            <Badge variant={badgeVariantFor(session.status)}>
              {STATUS_LABEL[session.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            Updated {formatRelativeTime(session.updatedAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {primaryAction}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDuplicate}
            disabled={duplicateSession.isPending}
            title="Duplicate"
          >
            <Copy className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            disabled={deleteSession.isPending}
            title="Delete"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

const SessionSection = ({
  title,
  sessions,
}: {
  title: string
  sessions: Array<SessionRecord>
}): JSX.Element | null => {
  if (sessions.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        {title}{" "}
        <span className="text-muted-foreground">({sessions.length})</span>
      </h2>
      <div className="space-y-2">
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))}
      </div>
    </section>
  )
}

const IN_PROGRESS_STATUSES: ReadonlyArray<SessionStatus> = [
  "active",
  "paused",
  "scheduled",
]

const SessionsRoute = (): JSX.Element => {
  const { data: sessions, isLoading } = useSessions()

  if (isLoading || !sessions) {
    return <SessionsSkeleton />
  }

  const byRecency = [...sessions].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  )
  const inProgress = byRecency.filter((s) =>
    IN_PROGRESS_STATUSES.includes(s.status)
  )
  const drafts = byRecency.filter((s) => s.status === "draft")
  const completed = byRecency.filter((s) => s.status === "completed")

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
          <Sparkles className="size-6" />
          <p>No sessions yet.</p>
          <Button asChild size="sm" className="mt-2">
            <Link to="/">Start something new</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-3xl space-y-8">
      <SessionSection title="In progress" sessions={inProgress} />
      <SessionSection title="Drafts" sessions={drafts} />
      <SessionSection title="Completed" sessions={completed} />
    </div>
  )
}

export const Route = createFileRoute("/_dashboard/sessions/")({
  component: SessionsRoute,
})
