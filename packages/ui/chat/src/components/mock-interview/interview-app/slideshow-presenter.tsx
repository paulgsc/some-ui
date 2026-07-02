import { InterviewProgressHeader } from "@chat/components/mock-interview/progress-header"
import { PreparationPhase } from "@chat/components/mock-interview/preparation-phase"
import { QuestionPlayback } from "@chat/components/mock-interview/question-playback"
import { RecordingPhase } from "@chat/components/mock-interview/recording-phase"
import { ReviewPhase } from "@chat/components/mock-interview/review-phase"
import { SessionComplete } from "@chat/components/mock-interview/session-complete"
import { WelcomeScreen } from "@chat/components/mock-interview/welcome-screen"
import type { UseInterviewSessionReturn } from "@chat/hooks/use-interview-session"

type SlideshowPresenterProps = {
  session: UseInterviewSessionReturn
}

/**
 * Renders the session state as a paginated, one-question-at-a-time flow.
 * All session logic lives in `useInterviewSession` - this component only
 * maps phase -> screen, so a future `ChatVoicePresenter` can consume the
 * exact same hook without touching session state.
 */
export const SlideshowPresenter = ({
  session,
}: SlideshowPresenterProps): React.JSX.Element | null => {
  const {
    state,
    currentQuestion,
    isLastQuestion,
    progress,
    recording,
    ttsAdapter,
    resumeAvailable,
    actions,
  } = session

  if (state.phase === "welcome") {
    return (
      <WelcomeScreen
        onStart={actions.start}
        resumeAvailable={resumeAvailable}
        onResume={actions.resumeSession}
        onDiscardResume={actions.discardResume}
      />
    )
  }

  if (state.phase === "complete") {
    return (
      <SessionComplete
        answers={state.answers}
        questions={state.questions}
        onRestart={actions.restart}
      />
    )
  }

  if (!currentQuestion) return null

  return (
    <div className="pb-16">
      <InterviewProgressHeader
        current={progress.current}
        total={progress.total}
        phase={state.phase}
      />

      {state.phase === "question" && (
        <QuestionPlayback
          question={currentQuestion}
          questionNumber={progress.current}
          totalQuestions={progress.total}
          ttsAdapter={ttsAdapter}
          onComplete={actions.questionPlaybackDone}
        />
      )}

      {state.phase === "preparation" && (
        <PreparationPhase
          question={currentQuestion.question}
          notes={state.notes}
          onNotesChange={actions.setNotes}
          onStartRecording={actions.beginRecording}
        />
      )}

      {state.phase === "recording" && (
        <RecordingPhase
          question={currentQuestion.question}
          recording={recording}
        />
      )}

      {(state.phase === "transcribing" || state.phase === "review") && (
        <ReviewPhase
          audioUrl={state.audioUrl}
          transcription={state.transcription}
          onTranscriptChange={actions.editTranscript}
          onContinue={actions.continueSession}
          onRetry={actions.retryAnswer}
          isLastQuestion={isLastQuestion}
        />
      )}
    </div>
  )
}
