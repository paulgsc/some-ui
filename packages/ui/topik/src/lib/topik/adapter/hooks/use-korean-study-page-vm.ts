import { useId, useMemo } from "react"
import { useHostHold } from "@some-ui/react-hooks"
import { useSessionConfig } from "@topik/lib/topik/adapter/context/session-config-context"
import { useSession } from "@topik/lib/topik/adapter/hooks/use-session"
import {
  actions,
  getAvailableTopiks,
  getCurrentBatch,
  getCurrentMessage,
  getVisibleMessages,
  selectors,
} from "@topik/lib/topik/core/session-selectors"
import type {
  FeedbackData,
  PlayState,
  QuizStage,
} from "@topik/lib/topik/core/session-types"
import type { TopikMetadata } from "@topik/lib/topik/entity/topik-metadata"
import type { Message, Question } from "@topik/lib/topik/entity/topik-types"

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
  const { topikRepository, metadataRepository, speaker, host } =
    useSessionConfig()

  // componentId is an opaque, per-instance key threaded through to the
  // session/TTS pipeline (see use-session.ts, tts-effect-handler.ts) - it's
  // never parsed or persisted, so React's own useId() is a
  // better fit than a hand-rolled UUID: it's stable across re-renders
  // without touching a ref during render.
  const componentId = useId()

  const session = useSession({
    repository: topikRepository,
    metadataRepository,
    speaker,
    componentId,
    // No voice, no spoken prompts. The effect executor already treats a
    // missing adapter as "no TTS handler"; saying so here keeps the two
    // from disagreeing.
    enableTTS: speaker !== null,
  })

  const { state, dispatch } = session

  // The conversation waits while the session it plays in waits (SS2): what
  // that means for the chat is the reducer's.
  useHostHold(host, {
    hold: () => dispatch({ type: "HOST_HELD" }),
    release: () => dispatch({ type: "HOST_RELEASED" }),
  })

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
