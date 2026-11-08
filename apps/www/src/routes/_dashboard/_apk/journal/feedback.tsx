import type { JSX } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"

import { KIND_WORDS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { BACK, StudioPage } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.feedback

/**
 * Studio's Feedback (SFEED1, #2731): its own page from the start, though
 * nothing keeps a note on an episode yet (SFEED6), so it says what one is
 * and that none is kept.
 */
const Feedback = (): JSX.Element => (
  <StudioPage
    heading={KIND_WORDS.feedback.name}
    intro={WORDS.intro}
    back={
      <Link to="/journal" className={BACK}>
        {STUDIO_INDEX_WORDS.back}
      </Link>
    }
  >
    <p className="text-muted-foreground text-sm">{WORDS.none}</p>
  </StudioPage>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/feedback")({
  component: Feedback,
})
