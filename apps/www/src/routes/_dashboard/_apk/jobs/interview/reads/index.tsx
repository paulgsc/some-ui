import { createFileRoute } from "@tanstack/react-router"

import { ReadsPage } from "@/components/jobs/interview/reads"

/** Read aloud, the week's own section (IW8). */
export const Route = createFileRoute("/_dashboard/_apk/jobs/interview/reads/")({
  component: ReadsPage,
})
