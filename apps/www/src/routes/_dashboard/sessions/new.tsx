import type { JSX } from "react"
import { ACTIVITY_IDS } from "@some-ui/activity-catalog"
import type { ActivityId } from "@some-ui/activity-catalog"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@some-ui/shared"
import { createFileRoute, Link } from "@tanstack/react-router"

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

const EditSessionRoute = ({
  sessionId,
}: {
  sessionId: string
}): JSX.Element => {
  const { data: session, isLoading } = useSession(sessionId)

  if (isLoading) return <ComposerSkeleton />
  if (!session) return <EditSessionNotFound />

  return <SessionComposer existingSession={session} />
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
