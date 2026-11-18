import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { ReadPage } from "@/components/jobs/interview/reads"

/**
 * The phone's alone: the flag is read inline, so other builds drop the page
 * (vite-env.d.ts, VITE_DEVICE_BACKEND), as the layout's does.
 */
const Read = (): JSX.Element | null => {
  const { card } = Route.useParams()
  return import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
    <ReadPage id={card} />
  ) : null
}

/** One read's page (IW8). */
export const Route = createFileRoute(
  "/_dashboard/_apk/jobs/interview/reads/$card"
)({ component: Read })
