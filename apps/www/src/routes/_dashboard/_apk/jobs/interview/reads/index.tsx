import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { ReadsPage } from "@/components/jobs/interview/reads"

/**
 * The phone's alone: the flag is read inline, so other builds drop the page
 * (vite-env.d.ts, VITE_DEVICE_BACKEND), as the layout's does.
 */
const Reads = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <ReadsPage /> : null

/** Scripts, the week's own section (IW8). */
export const Route = createFileRoute("/_dashboard/_apk/jobs/interview/reads/")({
  component: Reads,
})
