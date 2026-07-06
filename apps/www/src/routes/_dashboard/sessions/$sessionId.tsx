import type { JSX } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "some-ui-shared"

import { useSession } from "@/lib/tenant"
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

const SessionPlayerRoute = (): JSX.Element => {
  const { sessionId } = Route.useParams()
  const { data: session, isLoading } = useSession(String(sessionId))

  if (isLoading) return <PlayerSkeleton />
  if (!session) return <SessionNotFound />
  if (session.status === "draft")
    return <DraftGuard sessionId={String(sessionId)} />

  return <LivePlayer key={session.id} session={session} />
}

export const Route = createFileRoute("/_dashboard/sessions/$sessionId")({
  component: SessionPlayerRoute,
})
