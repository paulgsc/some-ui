import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { ReadPage } from "@/components/jobs/interview/reads"

const Read = (): JSX.Element => <ReadPage id={Route.useParams().card} />

/** One read's page (IW8). */
export const Route = createFileRoute(
  "/_dashboard/_apk/jobs/interview/reads/$card"
)({ component: Read })
