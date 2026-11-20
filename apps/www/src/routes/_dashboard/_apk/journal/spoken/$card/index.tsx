import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { SpokenParts } from "@/components/studio/spoken"

/** A spoken card in its parts (W5), and the essay's copy. */
const ScriptPage = (): JSX.Element => {
  const { card }: { card: string } = Route.useParams()
  return <SpokenParts id={card} />
}

export const Route = createFileRoute("/_dashboard/_apk/journal/spoken/$card/")({
  component: ScriptPage,
})
