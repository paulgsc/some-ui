import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "some-ui-shared"

const SessionPlayerRoute = (): JSX.Element => {
  const { sessionId } = Route.useParams()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session {sessionId}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        The live session player lands with Epic E.
      </CardContent>
    </Card>
  )
}

export const Route = createFileRoute("/_dashboard/sessions/$sessionId")({
  component: SessionPlayerRoute,
})
