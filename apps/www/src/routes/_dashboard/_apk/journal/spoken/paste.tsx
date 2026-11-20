import { createFileRoute } from "@tanstack/react-router"

import { PasteSpoken } from "@/components/studio/spoken"

/** Paste a spoken card (W5): the words, how they split into parts, and Keep. */
export const Route = createFileRoute("/_dashboard/_apk/journal/spoken/paste")({
  component: () => <PasteSpoken />,
})
