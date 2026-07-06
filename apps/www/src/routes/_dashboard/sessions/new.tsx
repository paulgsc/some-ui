import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "some-ui-shared"

import { ACTIVITY_IDS } from "@/lib/activity-catalog"
import type { ActivityId } from "@/lib/activity-catalog"

type NewSessionSearch = {
  activity?: ActivityId
}

function isActivityId(value: unknown): value is ActivityId {
  return typeof value === "string" && ACTIVITY_IDS.some((id) => id === value)
}

const NewSessionRoute = (): JSX.Element => {
  const { activity } = Route.useSearch()

  return (
    <Card>
      <CardHeader>
        <CardTitle>New session</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        The point-and-click session composer lands with Epic D.
        {activity && (
          <>
            {" "}
            Pre-selected activity:{" "}
            <span className="font-medium">{activity}</span>.
          </>
        )}
      </CardContent>
    </Card>
  )
}

export const Route = createFileRoute("/_dashboard/sessions/new")({
  validateSearch: (search: Record<string, unknown>): NewSessionSearch => ({
    activity: isActivityId(search.activity) ? search.activity : undefined,
  }),
  component: NewSessionRoute,
})
