import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "some-ui-shared"

const SessionsRoute = (): JSX.Element => (
  <Card>
    <CardHeader>
      <CardTitle>Sessions</CardTitle>
    </CardHeader>
    <CardContent className="text-muted-foreground text-sm">
      The sessions list (draft/scheduled/active/completed) lands with Epic E.
    </CardContent>
  </Card>
)

export const Route = createFileRoute("/_dashboard/sessions/")({
  component: SessionsRoute,
})
