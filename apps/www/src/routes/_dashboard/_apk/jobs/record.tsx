import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { JobsRecord } from "@/components/jobs/record"

const RecordRoute = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <JobsRecord /> : null

export const Route = createFileRoute("/_dashboard/_apk/jobs/record")({
  component: RecordRoute,
})
