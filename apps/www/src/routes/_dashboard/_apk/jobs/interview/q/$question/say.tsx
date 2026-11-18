import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { SayPage } from "@/components/jobs/interview/ladder"

/**
 * The phone's alone: the flag is read inline, so other builds drop the page
 * (vite-env.d.ts, VITE_DEVICE_BACKEND), as the layout's does.
 */
const Say = (): JSX.Element | null => {
  const { question } = Route.useParams()
  const { rung } = Route.useSearch()
  return import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
    <SayPage id={question} rung={rung} />
  ) : null
}

/** A question said from cues, or your own way (IW8): own unless the search says cues. */
export const Route = createFileRoute(
  "/_dashboard/_apk/jobs/interview/q/$question/say"
)({
  component: Say,
  // Read here, not from lib/interview-week, which only the phone's build carries.
  validateSearch: (search): { rung: "cues" | "own" } => ({
    rung: search.rung === "cues" ? "cues" : "own",
  }),
})
