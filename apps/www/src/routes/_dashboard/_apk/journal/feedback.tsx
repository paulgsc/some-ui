import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { KIND_WORDS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { FeedbackNotes } from "@/components/studio/episode-feedback"
import { StudioPage } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.feedback

/** The notes this phone keeps, the phone's alone (`build.paths.ts`). */
const Notes =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? FeedbackNotes : null

/**
 * Studio's Feedback (SFEED1, #2731; SFEED6, #2745): every note left on an
 * episode, the newest first, with where each goes.
 */
const Feedback = (): JSX.Element => (
  <StudioPage
    heading={KIND_WORDS.feedback.name}
    intro={WORDS.intro}
    back="index"
  >
    {Notes !== null && <Notes none={WORDS.none} />}
  </StudioPage>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/feedback")({
  component: Feedback,
})
