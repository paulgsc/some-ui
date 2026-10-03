import { AphTrend } from "@some-ui/aph"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_dashboard/_apk/aph/trend")({
  component: AphTrend,
})
