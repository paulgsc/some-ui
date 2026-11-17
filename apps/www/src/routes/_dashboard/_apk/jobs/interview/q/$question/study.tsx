import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { StudyPage } from "@/components/jobs/interview/ladder"

const Study = (): JSX.Element => <StudyPage id={Route.useParams().question} />

/** A question's ready answer, studied (IW8). */
export const Route = createFileRoute(
  "/_dashboard/_apk/jobs/interview/q/$question/study"
)({ component: Study })
