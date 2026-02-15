import { useMemo, useRef } from "react"
import {
  metadataRepository,
  topikRepository,
} from "@chat/lib/session/app-config"
import {
  actions,
  getCurrentBatch,
  getCurrentMessage,
  getVisibleMessages,
  selectors,
  useSession,
} from "@chat/lib/topik"
import { useQueryClient } from "@tanstack/react-query"
import { useSpeechQueue } from "some-ui-utils"

import { deriveChatPlayState, deriveQuizState } from "./korean-study.vm"
import { getAvailableTopiks } from "./session-selectors"

export function createId(): string {
  return crypto.randomUUID()
}

export function useKoreanStudyPageVM() {
  const queryClient = useQueryClient()

  // Generate once per hook instance
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

  const chatPlayState = useMemo(() => deriveChatPlayState(state), [state])
  const quizState = useMemo(() => deriveQuizState(state), [state])

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
      playState: chatPlayState,
      isQuizActive: selectors.isInQuiz(state),
      currentlySpeakingId:
        session.isSpeaking && currentMessage ? currentMessage.id : "",
    },
    quiz: {
      state: quizState,
      currentQuestion: selectors.getQuestionIndex(state),
      totalQuestions: currentBatch?.questions.length ?? 0,
      questions: currentBatch?.questions ?? [],
      score: selectors.getScore(state),
      feedbackData: selectors.getFeedback(state),
      chatPlayState,
    },
    tts: {
      isSpeaking: session.isSpeaking,
      speakMessage: session.speakMessage,
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
