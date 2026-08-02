import type { JSX } from "react"
import { SlideshowPresenter } from "@interview/components/mock-interview/interview-app/slideshow-presenter"
import { selectInterviewQuestions } from "@interview/data/interview-questions"
import type { UseInterviewSessionConfig } from "@interview/hooks/use-interview-session"
import { useInterviewSession } from "@interview/hooks/use-interview-session"
import type { Question } from "@interview/lib/interview/core/interview-types"

/**
 * How the session is presented to the user. Only "slideshow" (paginated,
 * one question at a time) ships today. "chat" is reserved for an
 * animated chat/voice presenter - `useInterviewSession` already returns
 * UI-agnostic state and actions, so adding it later means writing a new
 * presenter component, not touching session logic.
 */
export type InterviewPresentationMode = "slideshow" | "chat"

type InterviewAppProps = {
  mode?: InterviewPresentationMode
  sessionConfig?: UseInterviewSessionConfig
  /**
   * An explicit question set. Omit it and this package selects from its own
   * bank using `level`/`category` below - which is what the content
   * registry does, since it renders this component with whatever scene
   * props exist for its key and cannot supply a question bank it has no way
   * to import.
   */
  interviewQuestions?: Array<Question>
  /** Ignored when `interviewQuestions` is given. */
  level?: string
  /** Ignored when `interviewQuestions` is given. */
  category?: string
}

export const InterviewApp = ({
  mode = "slideshow",
  sessionConfig,
  interviewQuestions,
  level,
  category,
}: InterviewAppProps = {}): JSX.Element | null => {
  const questions =
    interviewQuestions ?? selectInterviewQuestions(level, category)
  const session = useInterviewSession(sessionConfig, questions)

  // The chat/voice presenter doesn't exist yet - fall back to slideshow
  // rather than rendering nothing.
  void mode

  return (
    <main className="min-h-screen bg-background">
      <SlideshowPresenter session={session} />
    </main>
  )
}
