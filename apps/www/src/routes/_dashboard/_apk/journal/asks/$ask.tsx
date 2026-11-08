import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { AskScreen } from "@/components/studio/asks"
import { StudioPage } from "@/components/studio/layout"

/** One ask (SFEED1, #2731), by its repository and number. */
const AskPage = (): JSX.Element => {
  const { ask }: { ask: string } = Route.useParams()
  return (
    <StudioPage heading={STUDIO_INDEX_WORDS.asks.heading} back="asks">
      <AskScreen id={ask} />
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/asks/$ask")({
  component: AskPage,
})
