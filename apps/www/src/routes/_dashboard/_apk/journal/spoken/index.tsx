import { createFileRoute } from "@tanstack/react-router"

import { SpokenList } from "@/components/studio/spoken"

/** Studio's Spoken (W5): paste a spoken card, and each card this phone keeps. */
export const Route = createFileRoute("/_dashboard/_apk/journal/spoken/")({
  component: () => <SpokenList />,
})
