import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { EmptyKindPage } from "@/components/studio/layout"

/** Studio's Clips (SFEED1, #2731). */
const Clips = (): JSX.Element => <EmptyKindPage kind="clips" />

export const Route = createFileRoute("/_dashboard/_apk/journal/clips")({
  component: Clips,
})
