import type { FC } from "react"
import { useEffect, useMemo } from "react"
import { ChatPanel } from "@chat/components/topik/chat-panel"
import { QuizPanel } from "@chat/components/topik/quiz-panel"
import { SessionHeader } from "@chat/components/topik/session-header"
import { useChatOrchestrator } from "@chat/hooks/topik/use-chat-orchestrator"
import { useSessionFSM } from "@chat/hooks/topik/use-session-fsm"
import { useTTSIntegration } from "@chat/hooks/topik/use-tts-integration"
import type { ConversationBatch } from "@chat/types/topik"

const COMPONENT_ID = "topik-study-session"

type KoreanStudyPageProps = {
  conversationBatches: Array<ConversationBatch>
}

export const KoreanStudyPage: FC<KoreanStudyPageProps> = ({
  conversationBatches,
}) => {
  const {
    state,
    totalBatches,
    startChat,
    pauseChat,
    resumeChat,
    resetChat,
    nextMessage,
    jumpToMessage,
    startQuiz,
    submitAnswer,
    nextQuestion,
    completeAssessment,
  } = useSessionFSM({
    batches: conversationBatches,
    onBatchComplete: (batchIndex) => {
      console.log(`Batch ${batchIndex + 1} completed`)
    },
    onAllBatchesComplete: () => {
      console.log("All batches completed!")
    },
  })

  const batchIndex = state.currentBatchIndex
  const messageIndex = state.currentMessageIndex

  // Fixed: Check for null/undefined explicitly, not falsy (0 is valid)
  const currentBatch =
    batchIndex != null &&
    batchIndex >= 0 &&
    batchIndex < conversationBatches.length
      ? conversationBatches[batchIndex]
      : undefined

  // Fixed: Check for null/undefined explicitly, not falsy (0 is valid)
  const currentMessage =
    currentBatch &&
    messageIndex != null &&
    messageIndex >= 0 &&
    messageIndex < currentBatch.messages.length
      ? currentBatch.messages[messageIndex]
      : undefined

  const { isActive, isSpeaking, speakMessage } = useTTSIntegration({
    componentId: COMPONENT_ID,
    currentMessage,
    isPlaying: state.chatPlayState === "playing",
    onSpeakComplete: async () => {},
    onSpeakStart: () => {
      console.log(
        `[${COMPONENT_ID}] ▶️ Speak start (index=${state.currentMessageIndex})`
      )
    },
    onSpeakError: (error) => {
      console.error(`[${COMPONENT_ID}] ❌ TTS error`, error)
    },
  })

  const visibleMessages = useMemo(() => {
    if (state.chatPlayState === "not started") return []
    // Fixed: Check for null/undefined explicitly, not falsy
    if (!currentBatch || state.currentMessageIndex == null) return []
    return currentBatch.messages.slice(0, state.currentMessageIndex + 1)
  }, [currentBatch, state.chatPlayState, state.currentMessageIndex])

  useEffect(() => {
    if (!isSpeaking && !isActive && state.chatPlayState === "playing") {
      nextMessage()
    }
  }, [isSpeaking, isActive, state.chatPlayState, nextMessage])

  return (
    <div className="absolute inset-0 topik flex flex-col bg-background">
      <SessionHeader
        timeRemaining={state.timeRemaining ?? 0}
        score={state.score ?? 0}
        totalQuestions={currentBatch?.questions.length ?? 0}
        // Fixed: Removed the + 1 from inside the ?? check
        currentBatch={(state.currentBatchIndex ?? 0) + 1}
        totalBatches={totalBatches}
        onEndSession={() => completeAssessment(false)}
      />

      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        <div className="w-80 xl:w-96 flex-shrink-0">
          <ChatPanel
            messages={currentBatch?.messages ?? []}
            visibleMessages={visibleMessages}
            currentMessageIndex={state.currentMessageIndex ?? 0}
            playState={state.chatPlayState}
            onPlay={startChat}
            onPause={pauseChat}
            onReset={resetChat}
            onJumpToMessage={jumpToMessage}
            onSpeakMessage={speakMessage}
            isQuizActive={state.quizState !== "standby"}
            currentlySpeakingId={""}
          />
        </div>

        <div className="flex-1">
          <QuizPanel
            state={state.quizState}
            currentQuestion={state.currentQuestion ?? 0}
            totalQuestions={currentBatch?.questions.length ?? 0}
            questions={currentBatch?.questions ?? []}
            onSpeakMessage={speakMessage}
            onStartQuiz={startQuiz}
            onAnswerSubmit={submitAnswer}
            onNextQuestion={nextQuestion}
            onAssessmentComplete={completeAssessment}
            score={state.score ?? 0}
            feedbackData={state.feedbackData}
            chatPlayState={state.chatPlayState}
          />
        </div>
      </div>
    </div>
  )
}
