import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { ACTIVITY_IDS } from "@/lib/activity-catalog"
import type { ActivityId } from "@/lib/activity-catalog"
import { SessionComposer } from "@/components/composer/session-composer"

type NewSessionSearch = {
  activity?: ActivityId
}

function isActivityId(value: unknown): value is ActivityId {
  return typeof value === "string" && ACTIVITY_IDS.some((id) => id === value)
}

const NewSessionRoute = (): JSX.Element => {
  const { activity } = Route.useSearch()

  return <SessionComposer initialActivity={activity} />
}

export const Route = createFileRoute("/_dashboard/sessions/new")({
  validateSearch: (search: Record<string, unknown>): NewSessionSearch => ({
    activity: isActivityId(search.activity) ? search.activity : undefined,
  }),
  component: NewSessionRoute,
})
