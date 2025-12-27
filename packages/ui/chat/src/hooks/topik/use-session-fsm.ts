import { useCallback, useState } from "react"
import type { ConversationBatch, SessionState } from "@chat/types/topik"

type UseSessionFSMProps = {
  batches: Array<ConversationBatch>
  onBatchComplete?: (batchIndex: number) => void
  onAllBatchesComplete?: () => void
}

export function useSessionFSM({
  batches,
  onBatchComplete,
  onAllBatchesComplete,
}: UseSessionFSMProps) {
  const [state, setState] = useState<SessionState>({
    chatPlayState: "not started",
    quizState: "standby",
  })

  /* ───────────────── Chat controls ───────────────── */

  const startChat = useCallback(() => {
    setState(() => {
      return {
        currentBatchIndex: 0,
        currentMessageIndex: 0,
        timeRemaining: 180,
        chatPlayState: "playing",
        quizState: "standby",
        score: 0,
      }
    })
  }, [])

  const pauseChat = useCallback(() => {
    setState((prev) => ({
      ...prev,
      chatPlayState: "paused",
    }))
  }, [])

  const resumeChat = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentBatchIndex: prev.currentBatchIndex ?? 0,
      currentMessageIndex: prev.currentMessageIndex ?? 0,
      timeRemaining: prev.timeRemaining ?? 180,
      chatPlayState: "playing",
    }))
  }, [])

  const resetChat = useCallback(() => {
    setState(() => ({
      chatPlayState: "not started",
      quizState: "standby",
    }))
  }, [])

  /**
   * Called ONLY after TTS completes a message.
   * This must be edge-triggered.
   */
  const nextMessage = useCallback(() => {
    setState((prev) => {
      if (prev.chatPlayState !== "playing")
        return { chatPlayState: "not started", quizState: "standby" }

      if (prev.currentMessageIndex == null || prev.currentBatchIndex == null) {
        return prev
      }

      const currentBatch = batches[prev.currentBatchIndex]

      const nextIndex = prev.currentMessageIndex + 1

      // Batch complete → transition to quiz
      if (nextIndex >= currentBatch.messages.length) {
        return {
          ...prev,
          chatPlayState: "finished",
          quizState: "ready",
        }
      }

      return {
        ...prev,
        currentMessageIndex: nextIndex,
      }
    })
  }, [batches])

  const jumpToMessage = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      currentMessageIndex: index,
    }))
  }, [])

  /* ───────────────── Quiz controls ───────────────── */

  const startQuiz = useCallback(() => {
    console.log("[useSessionFSM] 📝 startQuiz called")
    setState((prev) => {
      // Only allow quiz start if chat is finished
      if (prev.chatPlayState !== "finished") {
        console.warn("[useSessionFSM] Cannot start quiz - chat not finished")
        return prev
      }

      return {
        ...prev,
        quizState: "active",
        currentQuestion: 0,
        score: prev.score ?? 0, // Initialize score if needed
      }
    })
  }, [])

  const submitAnswer = useCallback(
    (isCorrect: boolean, userAnswer?: string) => {
      setState((prev) => {
        // Fixed: Check for null/undefined explicitly
        if (prev.currentBatchIndex == null || prev.currentQuestion == null) {
          return prev
        }

        const currentBatch = batches[prev.currentBatchIndex]
        if (!currentBatch) return prev

        const q = currentBatch.questions[prev.currentQuestion]
        if (!q) return prev

        return {
          ...prev,
          score: isCorrect ? (prev.score ?? 0) + 1 : (prev.score ?? 0),
          quizState: "feedback",
          feedbackData: {
            isCorrect,
            questionType: q.type,
            userAnswer,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            grammarNote: q.grammarNote,
          },
        }
      })
    },
    [batches]
  )

  const nextQuestion = useCallback(() => {
    setState((prev) => {
      // Fixed: Check for null/undefined explicitly
      if (prev.currentBatchIndex == null || prev.currentQuestion == null) {
        return prev
      }

      const currentBatch = batches[prev.currentBatchIndex]
      if (!currentBatch) return prev

      const nextQ = prev.currentQuestion + 1

      if (nextQ >= currentBatch.questions.length) {
        return { ...prev, quizState: "summary" }
      }

      return {
        ...prev,
        currentQuestion: nextQ,
        quizState: "active",
        feedbackData: undefined,
      }
    })
  }, [batches])

  const completeAssessment = useCallback(
    (passed: boolean) => {
      setState((prev) => {
        // Fixed: Check for null/undefined explicitly
        if (prev.currentBatchIndex == null) {
          return prev
        }

        if (!passed) {
          // Retry batch - reset to beginning
          return {
            ...prev,
            chatPlayState: "not started",
            currentMessageIndex: undefined,
            quizState: "standby",
            currentQuestion: undefined,
            score: 0,
            feedbackData: undefined,
          }
        }

        // Advance to next batch
        if (prev.currentBatchIndex < batches.length - 1) {
          const nextBatchIndex = prev.currentBatchIndex + 1

          // Call batch complete callback
          if (onBatchComplete) {
            onBatchComplete(prev.currentBatchIndex)
          }

          return {
            currentBatchIndex: nextBatchIndex,
            chatPlayState: "not started",
            currentMessageIndex: undefined,
            quizState: "standby",
            currentQuestion: undefined,
            score: 0,
            timeRemaining: 180,
            feedbackData: undefined,
          }
        }
        // All batches complete
        console.log("[useSessionFSM] 🎊 All batches complete!")
        if (onAllBatchesComplete) {
          onAllBatchesComplete()
        }

        return {
          ...prev,
          quizState: "standby",
          chatPlayState: "finished",
        }
      })
    },
    [batches, onBatchComplete, onAllBatchesComplete]
  )

  return {
    state,
    totalBatches: batches.length,

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

    isWaitingForTTS: false,
  }
}
