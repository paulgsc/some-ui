import type { JSX } from "react"
import { AphTrend } from "@some-ui/aph"
import { createFileRoute } from "@tanstack/react-router"

import { useMinuteClock } from "@/lib/clock"

/** The host's clock, so the range ends on today even after midnight. */
const TrendRoute = (): JSX.Element => <AphTrend now={useMinuteClock()} />

export const Route = createFileRoute("/_dashboard/_apk/aph/trend")({
  component: TrendRoute,
})
