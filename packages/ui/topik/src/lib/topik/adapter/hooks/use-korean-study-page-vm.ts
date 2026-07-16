import { useId, useMemo } from "react"
import type {
  FeedbackData,
  Message,
  PlayState,
  Question,
  QuizStage,
  TopikMetadata,
} from "@topik/lib/topik"
import {
  actions,
  getCurrentBatch,
  getCurrentMessage,
  getVisibleMessages,
  selectors,
  useSession,
  useSessionConfig,
} from "@topik/lib/topik"
import { getAvailableTopiks } from "@topik/lib/topik/adapter/session-selectors"

export type KoreanStudyPageVM = {
  header: {
    timeRemaining: number
    score: number
    totalQuestions: number
    currentBatch: number
    totalBatches: number
    topikDisplayName: string | null
    onEndSession: () => void
    topikItems: Array<TopikMetadata>
    topikLoading: boolean
    topikError: string | null
    currentTopikKey: string | null
    onTopikSelect: (key: string) => void
    onTopikReload: () => void
  }
  chat: {
    messages: Array<Message>
    visibleMessages: Array<Message>
    currentMessageIndex: number
    playState: PlayState
    isQuizActive: boolean
    currentlySpeakingId: string
    isSpeaking: boolean
    onSpeakMessage: (message: Message) => Promise<void>
  }
  quiz: {
    quizStage: QuizStage
    isInQuiz: boolean
    currentQuestion: number
    totalQuestions: number
    questions: Array<Question>
    score: number
    feedbackData: FeedbackData | null
    chatPlayState: PlayState
    isSpeaking: boolean
    onSpeakMessage: (message: Message) => Promise<void>
  }
  actions: {
    startChat: () => void
    resumeChat: () => void
    pauseChat: () => void
    resetSession: () => void
    jumpToMessage: (idx: number) => void
    startQuiz: () => void
    submitAnswer: (correct: boolean, answer: string) => void
    advanceQuestion: () => void
    passBatch: () => void
    failBatch: () => void
  }
}

export function useKoreanStudyPageVM(): KoreanStudyPageVM {
  const { topikRepository, metadataRepository, audioTTS } = useSessionConfig()

  // componentId is an opaque, per-instance key threaded through to the
  // session/TTS pipeline (see use-session.ts, tts-effect-handler.ts) - it's
  // never parsed or persisted, so React's own useId() (already the pattern
  // some-ui-utils's use-speech-queue.ts uses for the same purpose) is a
  // better fit than a hand-rolled UUID: it's stable across re-renders
  // without touching a ref during render.
  const componentId = useId()

  const session = useSession({
    repository: topikRepository,
    metadataRepository,
    audioTTS,
    componentId,
    enableTTS: true,
  })

  const { state, dispatch } = session

  // Cleanup audio on unmount

  // getAvailableTopiks/getCurrentBatch/getCurrentMessage are direct
  // property/array lookups against `state` - no allocation, so the
  // returned reference is already stable whenever `state` doesn't change.
  // useMemo here bought nothing but an exhaustive-deps violation (closing
  // over the whole `state` object while only listing sub-paths).
  const topikItems = getAvailableTopiks(state)
  const currentBatch = getCurrentBatch(state)
  const currentMessage = getCurrentMessage(state)

  // getVisibleMessages does allocate (Array.slice), so it's kept memoized
  // to preserve reference stability - keyed on the whole `state` it's
  // actually called with, which also satisfies exhaustive-deps.
  const visibleMessages = useMemo(() => getVisibleMessages(state), [state])

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
