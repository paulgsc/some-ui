import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { RENDERS_WORDS } from "@/lib/renders"
import { StudioPage } from "@/components/studio/layout"
import { RendersBoard } from "@/components/studio/renders"

/**
 * Studio › Renders (SFEED13, #2761): what home is making, what waits for
 * room, and what's coming. Reached from the line above Studio's tiles and
 * from Settings › Status.
 */
const RendersPage = (): JSX.Element => (
  <StudioPage
    heading={RENDERS_WORDS.heading}
    intro={RENDERS_WORDS.intro}
    back="index"
  >
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? <RendersBoard /> : null}
  </StudioPage>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/renders")({
  component: RendersPage,
})
