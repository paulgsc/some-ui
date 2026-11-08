import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { FEEDBACK_WORDS } from "@/lib/episode-feedback"
import { KIND_WORDS, STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import {
  FeedbackList,
  useEpisodeNotes,
} from "@/components/studio/episode-feedback"
import { StudioPage } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS.feedback

/**
 * Studio's Feedback (SFEED1, #2731; SFEED6, #2745): every note left on an
 * episode, the newest first, with where each goes.
 */
const Feedback = (): JSX.Element => {
  const notes = useEpisodeNotes()
  return (
    <StudioPage
      heading={KIND_WORDS.feedback.name}
      intro={WORDS.intro}
      back="index"
    >
      {notes.length === 0 ? (
        <p className="text-muted-foreground text-sm">{WORDS.none}</p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {FEEDBACK_WORDS.waiting}
          </p>
          <FeedbackList notes={notes} />
        </>
      )}
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/feedback")({
  component: Feedback,
})
