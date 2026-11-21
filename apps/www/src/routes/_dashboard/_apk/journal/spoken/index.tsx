import { createFileRoute } from "@tanstack/react-router"

import { SpokenList } from "@/components/studio/spoken"

// Spoken is the Android app's alone (`build.paths.ts`): other builds drop it.
const Page = import.meta.env.VITE_DEVICE_BACKEND === "true" ? SpokenList : null

/** Studio's Spoken (W5): paste a spoken card, and each card this phone keeps. */
export const Route = createFileRoute("/_dashboard/_apk/journal/spoken/")({
  component: () => (Page === null ? null : <Page />),
})
