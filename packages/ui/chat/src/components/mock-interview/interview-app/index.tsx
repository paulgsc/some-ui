import { SlideshowPresenter } from "@chat/components/mock-interview/interview-app/slideshow-presenter"
import type {
  UseInterviewSessionConfig,
} from "@chat/hooks/use-interview-session"
import { useInterviewSession } from "@chat/hooks/use-interview-session"

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
}

export const InterviewApp = ({
  mode = "slideshow",
  sessionConfig,
}: InterviewAppProps): React.JSX.Element | null => {
  const session = useInterviewSession(sessionConfig)

  // The chat/voice presenter doesn't exist yet - fall back to slideshow
  // rather than rendering nothing.
  void mode

  return (
    <main className="min-h-screen bg-background">
      <SlideshowPresenter session={session} />
    </main>
  )
}
