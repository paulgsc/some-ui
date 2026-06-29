import { useMemo, useRef } from "react"
import {
  actions,
  getCurrentBatch,
  getCurrentMessage,
  getVisibleMessages,
  selectors,
  useSession,
  useSessionConfig,
} from "@chat/lib/topik"
import { getAvailableTopiks } from "@chat/lib/topik/adapter/session-selectors"

export function createId(): string {
  return crypto.randomUUID()
}

export function useKoreanStudyPageVM() {
  const { topikRepository, metadataRepository, audioTTS } = useSessionConfig()

  const componentIdRef = useRef<string | null>(null)
  if (!componentIdRef.current) {
    componentIdRef.current = createId()
  }
  const componentId = componentIdRef.current

  const session = useSession({
    repository: topikRepository,
    metadataRepository,
    audioTTS,
    componentId,
    enableTTS: true,
  })

  const { state, dispatch } = session

  // Cleanup audio on unmount

  const topikItems = useMemo(
    () => getAvailableTopiks(state),
    [state.dataRef.catalog.data]
  )

  const currentBatch = useMemo(
    () => getCurrentBatch(state),
    [state.dataRef.batches, state.active?.cursor.batch]
  )

  const currentMessage = useMemo(
    () => getCurrentMessage(state),
    [state.dataRef.batches, state.active?.cursor.message]
  )

  const visibleMessages = useMemo(
    () => getVisibleMessages(state),
    [state.dataRef.batches, state.active?.cursor.message]
  )

  return useMemo(
    () => ({
      header: {
        timeRemaining: selectors.getTimeRemaining(state),
        score: selectors.getScore(state),
        totalQuestions: currentBatch?.questions.length ?? 0,
        currentBatch: selectors.getBatchIndex(state) + 1,
        totalBatches: selectors.getBatchCount(state),
        topikDisplayName: selectors.getTopikKey(state),
        onEndSession: (): void => dispatch(actions.failBatch()),
        topikItems,
        topikLoading: selectors.isCatalogLoading(state),
        topikError: selectors.getCatalogError(state),
        currentTopikKey: selectors.getTopikKey(state),
        onTopikSelect: (key: string): void =>
          state.phase === "active"
            ? dispatch(actions.changeTopik())
            : dispatch(actions.selectTopik(key)),
        onTopikReload: (): void => dispatch(actions.requestCatalog()),
      },
      chat: {
        messages: currentBatch?.messages ?? [],
        visibleMessages,
        currentMessageIndex: selectors.getMessageIndex(state),
        playState: state.active?.playState ?? "paused",
        isQuizActive: selectors.isInQuiz(state),
        currentlySpeakingId:
          session.isSpeaking && currentMessage ? currentMessage.id : "",
        isSpeaking: session.isSpeaking,
        onSpeakMessage: session.speakMessage,
      },
      quiz: {
        quizStage: state.active?.quizStage ?? "question",
        isInQuiz: selectors.isInQuiz(state),
        currentQuestion: selectors.getQuestionIndex(state),
        totalQuestions: currentBatch?.questions.length ?? 0,
        questions: currentBatch?.questions ?? [],
        score: selectors.getScore(state),
        feedbackData: state.feedback,
        chatPlayState: state.active?.playState ?? "paused",
        isSpeaking: session.isSpeaking,
        onSpeakMessage: session.speakMessage,
      },
      actions: {
        startChat: (): void => dispatch(actions.startChat()),
        resumeChat: (): void => dispatch(actions.resumeChat()),
        pauseChat: (): void => dispatch(actions.pauseChat()),
        resetSession: (): void => dispatch(actions.resetSession()),
        jumpToMessage: (idx: number): void =>
          dispatch(actions.jumpToMessage(idx)),
        startQuiz: (): void => dispatch(actions.startQuiz()),
        submitAnswer: (correct: boolean, answer: string): void =>
          dispatch(actions.submitAnswer(correct, answer)),
        advanceQuestion: (): void => dispatch(actions.advanceQuestion()),
        passBatch: (): void => dispatch(actions.passBatch()),
        failBatch: (): void => dispatch(actions.failBatch()),
      },
    }),
    [
      state,
      currentBatch,
      currentMessage,
      visibleMessages,
      topikItems,
      session.isSpeaking,
      session.speakMessage,
      dispatch,
    ]
  )
}
