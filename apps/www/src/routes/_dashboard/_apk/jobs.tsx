import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { JobDesk } from "@/components/jobs"

/**
 * One job brief at a time, from Drive and back (`@/components/jobs`). Read
 * inline so other builds drop the page and its share sheet
 * (src/vite-env.d.ts); this layout's guard keeps them from reaching it.
 */
const JobsRoute = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <JobDesk /> : null

export const Route = createFileRoute("/_dashboard/_apk/jobs")({
  component: JobsRoute,
})
