import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { SpokenParts } from "@/components/studio/spoken"

// Spoken is the Android app's alone (`build.paths.ts`): other builds drop it.
const Parts =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? SpokenParts : null

/** A spoken card in its parts (W5), and the essay's copy. */
const CardPage = (): JSX.Element | null => {
  const { card }: { card: string } = Route.useParams()
  return Parts === null ? null : <Parts id={card} />
}

export const Route = createFileRoute("/_dashboard/_apk/journal/spoken/$card/")({
  component: CardPage,
})
