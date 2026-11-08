import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { KIND_WORDS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { AsksList } from "@/components/studio/asks"
import { StudioPage } from "@/components/studio/layout"

/**
 * Studio's Asks (SFEED1, #2731): what waits on you to decide, A to Z, each
 * opening its own page.
 */
const Asks = (): JSX.Element => (
  <StudioPage
    heading={KIND_WORDS.asks.name}
    intro={STUDIO_INDEX_WORDS.asks.intro}
    back="index"
  >
    <AsksList />
  </StudioPage>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/asks/")({
  component: Asks,
})
