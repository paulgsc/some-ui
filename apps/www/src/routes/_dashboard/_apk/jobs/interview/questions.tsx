import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { QuestionsPage } from "@/components/jobs/interview/way-in"

/**
 * The phone's alone: the flag is read inline, so other builds drop the page
 * (vite-env.d.ts, VITE_DEVICE_BACKEND), as the layout's does.
 */
const Questions = (): JSX.Element | null =>
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? <QuestionsPage /> : null

/** The week's questions, today's first (IW15). */
export const Route = createFileRoute(
  "/_dashboard/_apk/jobs/interview/questions"
)({ component: Questions })
