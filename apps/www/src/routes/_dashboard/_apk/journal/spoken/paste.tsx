import { createFileRoute } from "@tanstack/react-router"

import { PasteSpoken } from "@/components/studio/spoken"

// Spoken is the Android app's alone (`build.paths.ts`): other builds drop it.
const Page = import.meta.env.VITE_DEVICE_BACKEND === "true" ? PasteSpoken : null

/** Paste a spoken card (W5): the words, how they split into parts, and Keep. */
export const Route = createFileRoute("/_dashboard/_apk/journal/spoken/paste")({
  component: () => (Page === null ? null : <Page />),
})
