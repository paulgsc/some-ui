import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { KIND_WORDS } from "@/lib/studio-index"
import { ClipScreen } from "@/components/studio/clips"
import { StudioPage } from "@/components/studio/layout"

/** One clip (SFEED7): its before and after, and the change that made it. */
const ClipPage = (): JSX.Element => {
  const { clip }: { clip: string } = Route.useParams()
  return (
    <StudioPage heading={KIND_WORDS.clips.name} back="clips">
      <ClipScreen id={clip} />
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/clips/$clip")({
  component: ClipPage,
})
