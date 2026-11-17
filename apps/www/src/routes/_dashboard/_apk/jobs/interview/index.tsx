import { createFileRoute } from "@tanstack/react-router"

import { InterviewPage } from "@/components/jobs/interview/week"

/** The interview week's own page (IW8): today's question, Read aloud, the rest, and the send. */
export const Route = createFileRoute("/_dashboard/_apk/jobs/interview/")({
  component: InterviewPage,
})
