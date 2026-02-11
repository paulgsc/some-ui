import { useCallback, useEffect, useMemo, useReducer } from "react"
import type {
  SessionEvent,
  SessionState,
} from "@chat/lib/topik/session-reducer"
import {
  createInitialState,
  sessionReducer,
} from "@chat/lib/topik/session-reducer"
import type { ConversationBatch, Message } from "@chat/types/topik"

type UseSessionConfig = {
  getBatches?: (
    topikKey: string
  ) => Promise<Array<ConversationBatch> | undefined>

  onBatchComplete?: (batchIndex: number) => void
  onAllBatchesComplete?: () => void
}

type UseSessionReturn = {
  state: SessionState
  dispatch: (event: SessionEvent) => void
  totalBatches: number
  currentBatch: ConversationBatch | undefined
  currentMessage: Message | undefined
  selectTopik: (topikKey: string) => void
  changeTopik: () => void
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
}

export function useSession({
  getBatches,
  onBatchComplete,
  onAllBatchesComplete,
}: UseSessionConfig): UseSessionReturn {
  const [state, dispatch] = useReducer(
    sessionReducer,
    undefined,
    createInitialState
  )

  /* ---------------------------------- */
  /* Batch hydration (controlled or async) */
  /* ---------------------------------- */

  // Async mode
  useEffect(() => {
    if (!getBatches) return
    if (state.phase !== "loadingBatches" || !state.topikKey) return

    let cancelled = false

    const load = async (): Promise<void> => {
      try {
        if (!state.topikKey) return
        const batches = await getBatches(state.topikKey)
        if (cancelled) return

        if (batches) {
          dispatch({ type: "BATCHES_LOADED", batches })
        } else {
          dispatch({
            type: "BATCHES_FAILED",
            error: "Topik not found",
          })
        }
      } catch (error) {
        if (cancelled) return
        dispatch({
          type: "BATCHES_FAILED",
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    load()
    return (): void => {
      cancelled = true
    }
  }, [state.phase, state.topikKey, getBatches])

  /* ---------------------------------- */
  /* Timer */
  /* ---------------------------------- */

  useEffect(() => {
    if (state.phase !== "chatPlaying") return
    if (state.timeRemaining <= 0) return

    const id = setInterval(() => {
      dispatch({ type: "TICK" })
    }, 1000)

    return (): void => clearInterval(id)
  }, [state.phase, state.timeRemaining])

  /* ---------------------------------- */
  /* Completion side-effects */
  /* ---------------------------------- */

  useEffect(() => {
    if (state.phase === "batchComplete") {
      onBatchComplete?.(state.batchIndex)
    }
  }, [state.phase, state.batchIndex, onBatchComplete])

  useEffect(() => {
    if (state.phase === "sessionComplete") {
      onAllBatchesComplete?.()
    }
  }, [state.phase, onAllBatchesComplete])

  /* ---------------------------------- */
  /* Derived state */
  /* ---------------------------------- */

  const totalBatches = state.batches.length

  const currentBatch = useMemo(
    () => state.batches[state.batchIndex],
    [state.batches, state.batchIndex]
  )

  const currentMessage = useMemo(
    () => currentBatch?.messages[state.messageIndex],
    [currentBatch, state.messageIndex]
  )

  /* ---------------------------------- */
  /* Stable event dispatchers */
  /* ---------------------------------- */

  const send = useCallback((event: SessionEvent): void => dispatch(event), [])

  const selectTopik = useCallback(
    (topikKey: string): void => send({ type: "SELECT_TOPIK", topikKey }),
    [send]
  )

  const changeTopik = useCallback(
    (): void => send({ type: "CHANGE_TOPIK" }),
    [send]
  )

  const startChat = useCallback(
    (): void => send({ type: "START_CHAT" }),
    [send]
  )

  const pauseChat = useCallback(
    (): void => send({ type: "PAUSE_CHAT" }),
    [send]
  )

  const resumeChat = useCallback(
    (): void => send({ type: "RESUME_CHAT" }),
    [send]
  )

  const resetChat = useCallback(
    (): void => send({ type: "RESET_CHAT" }),
    [send]
  )

  const messageSpoken = useCallback(
    (): void => send({ type: "MESSAGE_SPOKEN" }),
    [send]
  )

  const jumpToMessage = useCallback(
    (index: number): void => send({ type: "JUMP_TO_MESSAGE", index }),
    [send]
  )

  const startQuiz = useCallback(
    (): void => send({ type: "START_QUIZ" }),
    [send]
  )

  const submitAnswer = useCallback(
    (correct: boolean, userAnswer?: string): void =>
      send({ type: "ANSWER_SUBMITTED", correct, userAnswer }),
    [send]
  )

  const nextQuestion = useCallback(
    (): void => send({ type: "NEXT_QUESTION" }),
    [send]
  )

  const passAssessment = useCallback(
    (): void => send({ type: "ASSESSMENT_PASSED" }),
    [send]
  )

  const failAssessment = useCallback(
    (): void => send({ type: "ASSESSMENT_FAILED" }),
    [send]
  )

  return {
    state,
    dispatch: send,

    totalBatches,
    currentBatch,
    currentMessage,

    selectTopik,
    changeTopik,

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
  }
}
