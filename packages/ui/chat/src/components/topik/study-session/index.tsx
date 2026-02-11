import type { FC, JSX } from "react"
import { useCallback, useMemo } from "react"
import { ChatPanel } from "@chat/components/topik/chat-panel"
import { QuizPanel } from "@chat/components/topik/quiz-panel"
import { SessionHeader } from "@chat/components/topik/session-header"
import { useSession } from "@chat/hooks/topik/use-session-fsm"
import { useTopikLibrary } from "@chat/hooks/topik/use-topik-library"
import { useTTS } from "@chat/hooks/topik/use-tts-integration"

const COMPONENT_ID = "topik-study-session"

export const KoreanStudyPage: FC = (): JSX.Element => {
  // Load topik library
  const {
    loading: libraryLoading,
    error: libraryError,
    getTopikItems,
    getTopik,
    getTopikBatches,
  } = useTopikLibrary()

  // Provide async batch fetcher to session FSM
  const getBatches = useCallback(
    async (topikKey: string) => {
      return getTopikBatches(topikKey)
    },
    [getTopikBatches]
  )

  // Session FSM - reducer handles batch loading internally
  const {
    state,
    totalBatches,
    currentBatch,
    currentMessage,

    selectTopik,
    startChat,
    pauseChat,
    resumeChat,
    resetChat,
    messageSpoken,
    jumpToMessage,

    startQuiz,
    submitAnswer,
    nextQuestion,
    passAssessment,
    failAssessment,
  } = useSession({
    getBatches,
    onBatchComplete: (batchIndex) => {
      // eslint-disable-next-line no-console
      console.log(`✅ Batch ${batchIndex + 1} completed`)
    },
    onAllBatchesComplete: () => {
      // eslint-disable-next-line no-console
      console.log("🎊 All batches completed!")
    },
  })

  // TTS integration
  const { isSpeaking, speakMessage } = useTTS({
    componentId: COMPONENT_ID,
    currentMessage,
    phase: state.phase,
    onMessageComplete: messageSpoken,
  })

  // Get current topik metadata from reducer state
  const currentTopik = useMemo(() => {
    return state.topikKey ? getTopik(state.topikKey) : undefined
  }, [state.topikKey, getTopik])

  // Handle topik selection - reducer handles batch loading
  const handleTopikSelect = (topikKey: string): void => {
    selectTopik(topikKey)
  }

  // Derive visible messages for chat panel
  const visibleMessages = useMemo(() => {
    if (state.phase === "idle" || state.phase === "selecting") return []
    if (!currentBatch) return []
    return currentBatch.messages.slice(0, state.messageIndex + 1)
  }, [currentBatch, state.phase, state.messageIndex])

  // Derive play state for ChatPanel
  const chatPlayState = useMemo(() => {
    switch (state.phase) {
      case "selecting":
      case "idle":
        return "not started"
      case "chatPlaying":
        return "playing"
      case "chatPaused":
        return "paused"
      case "quizReady":
      case "quizActive":
      case "quizFeedback":
      case "quizSummary":
      case "sessionComplete":
        return "finished"
      default:
        return "not started"
    }
  }, [state.phase])

  // Derive quiz state for QuizPanel
  const quizState = useMemo(() => {
    switch (state.phase) {
      case "quizReady":
        return "ready"
      case "quizActive":
        return "active"
      case "quizFeedback":
        return "feedback"
      case "quizSummary":
        return "summary"
      default:
        return "standby"
    }
  }, [state.phase])

  return (
    <div className="absolute inset-0 topik flex flex-col bg-background">
      <SessionHeader
        timeRemaining={state.timeRemaining}
        score={state.score}
        totalQuestions={currentBatch?.questions.length ?? 0}
        currentBatch={state.batchIndex + 1}
        totalBatches={totalBatches}
        topikDisplayName={currentTopik?.displayName}
        onEndSession={() => failAssessment()}
        // Dialog props
        topikItems={getTopikItems()}
        topikLoading={libraryLoading}
        topikError={libraryError}
        currentTopikKey={state.topikKey ?? undefined}
        onTopikSelect={handleTopikSelect}
      />

      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* Chat Panel */}
        <div className="w-80 xl:w-96 flex-shrink-0">
          <ChatPanel
            messages={currentBatch?.messages ?? []}
            visibleMessages={visibleMessages}
            currentMessageIndex={state.messageIndex}
            playState={chatPlayState}
            onPlay={chatPlayState === "not started" ? startChat : resumeChat}
            onPause={pauseChat}
            onReset={resetChat}
            onJumpToMessage={jumpToMessage}
            onSpeakMessage={speakMessage}
            isQuizActive={
              state.phase !== "selecting" &&
              state.phase !== "idle" &&
              state.phase !== "chatPlaying" &&
              state.phase !== "chatPaused"
            }
            currentlySpeakingId={
              isSpeaking && currentMessage ? currentMessage.id : ""
            }
          />
        </div>

        {/* Quiz Panel */}
        <div className="flex-1">
          <QuizPanel
            state={quizState}
            currentQuestion={state.questionIndex}
            totalQuestions={currentBatch?.questions.length ?? 0}
            questions={currentBatch?.questions ?? []}
            onSpeakMessage={speakMessage}
            isSpeaking={isSpeaking}
            onStartQuiz={startQuiz}
            onAnswerSubmit={submitAnswer}
            onNextQuestion={nextQuestion}
            onAssessmentComplete={(passed) => {
              if (passed) {
                passAssessment()
              } else {
                failAssessment()
              }
            }}
            score={state.score}
            feedbackData={state.feedbackData}
            chatPlayState={chatPlayState}
          />
        </div>
      </div>
    </div>
  )
}
