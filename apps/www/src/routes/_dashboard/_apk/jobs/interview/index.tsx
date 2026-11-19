import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { InterviewPage } from "@/components/jobs/interview/week"

/**
 * The phone's alone: the flag is read inline, so other builds drop the page
 * (vite-env.d.ts, VITE_DEVICE_BACKEND), as the layout's does.
 */
const Interview = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <InterviewPage /> : null

/** The interview week's own page (IW8): today's question, Scripts, the rest, and the send. */
export const Route = createFileRoute("/_dashboard/_apk/jobs/interview/")({
  component: Interview,
})
