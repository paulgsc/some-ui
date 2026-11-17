import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { QuestionPage } from "@/components/jobs/interview/ladder"

const Question = (): JSX.Element => (
  <QuestionPage id={Route.useParams().question} />
)

/** A question and its ladder (IW8). */
export const Route = createFileRoute(
  "/_dashboard/_apk/jobs/interview/q/$question/"
)({ component: Question })
