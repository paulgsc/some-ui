import { useCallback, useEffect, useReducer } from "react"
import type {
  SessionEvent,
  SessionState,
} from "@chat/lib/topik/session-reducer"
import {
  createInitialState,
  sessionReducer,
} from "@chat/lib/topik/session-reducer"
import type { ConversationBatch } from "@chat/types/topik"

type UseSessionProps = {
  batches: Array<ConversationBatch> | undefined
  onBatchComplete?: (batchIndex: number) => void
  onAllBatchesComplete?: () => void
}

type UseSessionReturn = {
  state: SessionState
  dispatch: (event: SessionEvent) => void

  // Convenience methods (just dispatch wrappers)
  startChat: () => void
  pauseChat: () => void
  resumeChat: () => void
  resetChat: () => void
  messageSpoken: () => void
  jumpToMessage: (index: number) => void

  startQuiz: () => void
  submitAnswer: (correct: boolean, userAnswer?: string) => void
  nextQuestion: () => void
  passAssessment: () => void
  failAssessment: () => void

  // Derived helpers
  totalBatches: number
  currentBatch: ConversationBatch | undefined
  currentMessage: ConversationBatch["messages"][number] | undefined
}

export function useSession({
  batches,
  onBatchComplete,
  onAllBatchesComplete,
}: UseSessionProps): UseSessionReturn {
  const [state, baseDispatch] = useReducer(
    (s: SessionState, e: SessionEvent) => sessionReducer(s, e, batches ?? []),
    createInitialState()
  )

  // Wrap dispatch to handle side effects
  const dispatch = useCallback(
    (event: SessionEvent) => {
      if (!batches) return
      const prevState = state
      baseDispatch(event)

      // Side effects based on state transitions
      if (
        event.type === "ASSESSMENT_PASSED" &&
        prevState.phase === "quizSummary"
      ) {
        const nextBatchIndex = prevState.batchIndex + 1

        if (nextBatchIndex >= batches.length) {
          if (onAllBatchesComplete) onAllBatchesComplete()
        } else if (onBatchComplete) onBatchComplete(prevState.batchIndex)
      }
    },
    [state, batches, onBatchComplete, onAllBatchesComplete]
  )

  // Timer effect
  useEffect(() => {
    if (state.phase !== "chatPlaying") return

    const interval = setInterval(() => {
      dispatch({ type: "TICK" })
    }, 1000)

    return () => clearInterval(interval)
  }, [state.phase, dispatch])

  // Convenience methods
  const startChat = useCallback(
    () => dispatch({ type: "START_CHAT" }),
    [dispatch]
  )
  const pauseChat = useCallback(
    () => dispatch({ type: "PAUSE_CHAT" }),
    [dispatch]
  )
  const resumeChat = useCallback(
    () => dispatch({ type: "RESUME_CHAT" }),
    [dispatch]
  )
  const resetChat = useCallback(
    () => dispatch({ type: "RESET_CHAT" }),
    [dispatch]
  )
  const messageSpoken = useCallback(
    () => dispatch({ type: "MESSAGE_SPOKEN" }),
    [dispatch]
  )
  const jumpToMessage = useCallback(
    (index: number) => dispatch({ type: "JUMP_TO_MESSAGE", index }),
    [dispatch]
  )

  const startQuiz = useCallback(
    () => dispatch({ type: "START_QUIZ" }),
    [dispatch]
  )
  const submitAnswer = useCallback(
    (correct: boolean, userAnswer?: string) =>
      dispatch({ type: "ANSWER_SUBMITTED", correct, userAnswer }),
    [dispatch]
  )
  const nextQuestion = useCallback(
    () => dispatch({ type: "NEXT_QUESTION" }),
    [dispatch]
  )
  const passAssessment = useCallback(
    () => dispatch({ type: "ASSESSMENT_PASSED" }),
    [dispatch]
  )
  const failAssessment = useCallback(
    () => dispatch({ type: "ASSESSMENT_FAILED" }),
    [dispatch]
  )

  // Derived state
  const currentBatch = batches ? batches[state.batchIndex] : undefined
  const currentMessage = currentBatch
    ? currentBatch.messages[state.messageIndex]
    : undefined

  return {
    state,
    dispatch,

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

    totalBatches: batches?.length ?? 0,
    currentBatch,
    currentMessage,
  }
}
