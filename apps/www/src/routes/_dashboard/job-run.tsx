import { createFileRoute } from "@tanstack/react-router"

import { JobRun } from "@/components/job-run"

export const Route = createFileRoute("/_dashboard/job-run")({
  component: JobRun,
})
