import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { JobsScout } from "@/components/jobs/scout"

const ScoutRoute = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <JobsScout /> : null

export const Route = createFileRoute("/_dashboard/_apk/jobs/scout")({
  component: ScoutRoute,
})
