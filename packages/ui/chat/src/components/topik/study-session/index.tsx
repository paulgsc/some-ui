import type { FC } from "react"
import { useMemo } from "react"
import { ChatPanel } from "@chat/components/topik/chat-panel"
import { QuizPanel } from "@chat/components/topik/quiz-panel"
import { SessionHeader } from "@chat/components/topik/session-header"
import { useConversationBatches } from "@chat/hooks/topik/use-conversation-batches"
import { useSession } from "@chat/hooks/topik/use-session-fsm"
import { useTTS } from "@chat/hooks/topik/use-tts-integration"

const COMPONENT_ID = "topik-study-session"

type KoreanStudyPageProps = { path: string }

export const KoreanStudyPage: FC<KoreanStudyPageProps> = ({ path }) => {
  const conversationBatches = useConversationBatches({ path }) ?? undefined

  const {
    state,
    totalBatches,
    currentBatch,
    currentMessage,

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
    batches: conversationBatches,
    onBatchComplete: (batchIndex) => {
      console.log(`✅ Batch ${batchIndex + 1} completed`)
    },
    onAllBatchesComplete: () => {
      console.log("🎊 All batches completed!")
    },
  })

  const { isSpeaking, speakMessage } = useTTS({
    componentId: COMPONENT_ID,
    currentMessage,
    isPlaying: state.phase === "chatPlaying",
    onMessageComplete: messageSpoken,
  })

  // Derive visible messages for chat panel
  const visibleMessages = useMemo(() => {
    if (state.phase === "idle") return []
    if (!currentBatch) return []
    return currentBatch.messages.slice(0, state.messageIndex + 1)
  }, [currentBatch, state.phase, state.messageIndex])

  // Derive play state for ChatPanel
  const chatPlayState = useMemo(() => {
    switch (state.phase) {
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
        onEndSession={() => failAssessment()}
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
