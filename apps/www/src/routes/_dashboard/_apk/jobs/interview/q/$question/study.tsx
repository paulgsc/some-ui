import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { StudyPage } from "@/components/jobs/interview/ladder"

/**
 * The phone's alone: the flag is read inline, so other builds drop the page
 * (vite-env.d.ts, VITE_DEVICE_BACKEND), as the layout's does.
 */
const Study = (): JSX.Element | null => {
  const { question } = Route.useParams()
  return import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
    <StudyPage id={question} />
  ) : null
}

/** A question's ready answer, studied (IW8). */
export const Route = createFileRoute(
  "/_dashboard/_apk/jobs/interview/q/$question/study"
)({ component: Study })
