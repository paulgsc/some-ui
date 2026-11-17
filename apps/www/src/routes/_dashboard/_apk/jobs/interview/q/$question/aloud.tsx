import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { AloudPage } from "@/components/jobs/interview/ladder"

const Aloud = (): JSX.Element => <AloudPage id={Route.useParams().question} />

/** A question's ready answer, read aloud (IW8). */
export const Route = createFileRoute(
  "/_dashboard/_apk/jobs/interview/q/$question/aloud"
)({ component: Aloud })
