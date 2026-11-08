import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { KIND_WORDS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { ClipsList } from "@/components/studio/clips"
import { StudioPage } from "@/components/studio/layout"

/** Studio's Clips (SFEED7): the Library, every clip kept, the newest first. */
const Clips = (): JSX.Element => (
  <StudioPage
    heading={KIND_WORDS.clips.name}
    intro={STUDIO_INDEX_WORDS.clips.intro}
    back="index"
  >
    <ClipsList />
  </StudioPage>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/clips/")({
  component: Clips,
})
