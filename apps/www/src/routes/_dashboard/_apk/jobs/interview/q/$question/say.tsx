import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import type { SayRung } from "@/lib/interview-week/ladder"
import { sayRungOf } from "@/lib/interview-week/ladder"
import { SayPage } from "@/components/jobs/interview/ladder"

const Say = (): JSX.Element => (
  <SayPage id={Route.useParams().question} rung={Route.useSearch().rung} />
)

/** A question said from cues, or your own way (IW8): own unless the search says cues. */
export const Route = createFileRoute(
  "/_dashboard/_apk/jobs/interview/q/$question/say"
)({
  component: Say,
  validateSearch: (search): { rung: SayRung } => ({ rung: sayRungOf(search) }),
})
