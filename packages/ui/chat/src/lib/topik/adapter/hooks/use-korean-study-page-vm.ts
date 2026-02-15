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
import { useQueryClient } from "@tanstack/react-query"
import { useSpeechQueue } from "some-ui-utils"

export function createId(): string {
  // Check if the modern API exists and is in a secure context
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // Fallback: A simple manual UUID generator (or use a library like 'nanoid')
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function useKoreanStudyPageVM() {
  const { topikRepository, metadataRepository } = useSessionConfig()
  const queryClient = useQueryClient()

  const componentIdRef = useRef<string>(null)
  if (!componentIdRef.current) {
    componentIdRef.current = createId()
  }
  const componentId = componentIdRef.current

  const speechQueue = useSpeechQueue(componentId)

  const session = useSession({
    repository: topikRepository,
    metadataRepository,
    speechQueue,
    componentId,
    enableTTS: true,
  })

  const { state, dispatch, machine } = session
  console.log("what state are we in", state)

  const topikItems = useMemo(
    () => getAvailableTopiks(queryClient),
    [queryClient, state.dataRef.catalog.status]
  )

  const currentBatch = useMemo(
    () => getCurrentBatch(machine, queryClient),
    [machine, queryClient, state.active?.cursor.batch, state.dataRef.topikKey]
  )

  const currentMessage = useMemo(
    () => getCurrentMessage(machine, queryClient),
    [machine, queryClient, state.active?.cursor.message]
  )

  const visibleMessages = useMemo(
    () => getVisibleMessages(machine, queryClient),
    [machine, queryClient, state.active?.cursor.message]
  )

  return {
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
      onTopikSelect: (key: string): void => dispatch(actions.selectTopik(key)),
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
  }
}
