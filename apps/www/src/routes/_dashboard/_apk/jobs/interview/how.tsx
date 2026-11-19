import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { HowPage } from "@/components/jobs/interview/way-in"

/**
 * The phone's alone: the flag is read inline, so other builds drop the page
 * (vite-env.d.ts, VITE_DEVICE_BACKEND), as the layout's does.
 */
const How = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <HowPage /> : null

/** How a week goes (IW15): where takes go, and when the essay comes. */
export const Route = createFileRoute("/_dashboard/_apk/jobs/interview/how")({
  component: How,
})
