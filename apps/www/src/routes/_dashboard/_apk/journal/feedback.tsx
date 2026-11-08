import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { EmptyKindPage } from "@/components/studio/layout"

/** Studio's Feedback (SFEED1, #2731). */
const Feedback = (): JSX.Element => <EmptyKindPage kind="feedback" />

export const Route = createFileRoute("/_dashboard/_apk/journal/feedback")({
  component: Feedback,
})
