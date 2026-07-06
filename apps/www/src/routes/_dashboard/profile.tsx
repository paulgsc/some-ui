import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "some-ui-shared"

const ProfileRoute = (): JSX.Element => (
  <Card>
    <CardHeader>
      <CardTitle>Profile</CardTitle>
    </CardHeader>
    <CardContent className="text-muted-foreground text-sm">
      Profile editing lands with Epic C.
    </CardContent>
  </Card>
)

export const Route = createFileRoute("/_dashboard/profile")({
  component: ProfileRoute,
})
