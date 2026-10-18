import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { JobsToday } from "@/components/jobs/today"

const TodayRoute = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <JobsToday /> : null

export const Route = createFileRoute("/_dashboard/_apk/jobs/")({
  component: TodayRoute,
})
