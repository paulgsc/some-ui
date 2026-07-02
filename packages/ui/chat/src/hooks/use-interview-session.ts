import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react"
import { interviewQuestions } from "@chat/data/interview-questions"
import type { UseAudioRecorderReturn } from "@chat/hooks/use-audio-recorder"
import { useAudioRecorder } from "@chat/hooks/use-audio-recorder"
import {
  createInitialInterviewState,
  interviewReducer,
} from "@chat/lib/interview/core/interview-reducer"
import { createStaticQuestionRepository } from "@chat/lib/interview/core/question-repository"
import { createWebSpeechTTSAdapter } from "@chat/lib/interview/core/tts-adapter"
import { createMockTranscriptionAdapter } from "@chat/lib/interview/core/transcription-adapter"
import type {
  InterviewSessionState,
  InterviewTTSAdapter,
  PersistedSnapshot,
  Question,
  QuestionRepository,
  TranscriptionAdapter,
} from "@chat/lib/interview/core/interview-types"
import {
  clearPersistedSession,
  readPersistedSession,
  writePersistedSession,
} from "@chat/lib/interview/session-storage"

const POLL_INTERVAL_MS = 700

export type UseInterviewSessionConfig = {
  questionRepository?: QuestionRepository
  transcriptionAdapter?: TranscriptionAdapter
  ttsAdapter?: InterviewTTSAdapter
  persist?: boolean
}

export type UseInterviewSessionReturn = {
  state: InterviewSessionState
  currentQuestion: Question | undefined
  isLastQuestion: boolean
  progress: { current: number; total: number }
  recording: UseAudioRecorderReturn
  ttsAdapter: InterviewTTSAdapter
  resumeAvailable: boolean
  actions: {
    start: () => void
    questionPlaybackDone: () => void
    setNotes: (notes: string) => void
    beginRecording: () => void
    editTranscript: (transcript: string) => void
    retryAnswer: () => void
    continueSession: () => void
    restart: () => void
    resumeSession: () => void
    discardResume: () => void
  }
}

export const useInterviewSession = (
  config: UseInterviewSessionConfig = {}
): UseInterviewSessionReturn => {
  const { persist = true } = config

  const questionRepositoryRef = useRef(
    config.questionRepository ?? createStaticQuestionRepository(interviewQuestions)
  )
  const transcriptionAdapterRef = useRef(
    config.transcriptionAdapter ?? createMockTranscriptionAdapter()
  )
  const [ttsAdapter] = useState(
    () => config.ttsAdapter ?? createWebSpeechTTSAdapter()
  )

  const [state, dispatch] = useReducer(
    interviewReducer,
    undefined,
    createInitialInterviewState
  )

  const [resumeSnapshot, setResumeSnapshot] = useState<PersistedSnapshot | null>(
    () => (persist ? readPersistedSession() : null)
  )

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load the question bank once on mount
  useEffect(() => {
    let cancelled = false
    void questionRepositoryRef.current.list().then((questions) => {
      if (!cancelled) dispatch({ type: "QUESTIONS_LOADED", questions })
    })
    return (): void => {
      cancelled = true
    }
  }, [])

  const pollTranscription = useCallback((jobId: string): void => {
    const poll = async (): Promise<void> => {
      try {
        const result = await transcriptionAdapterRef.current.poll(jobId)
        dispatch({ type: "TRANSCRIPTION_UPDATED", result })

        if (result.status === "pending" || result.status === "processing") {
          pollTimeoutRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS)
        }
      } catch (error) {
        dispatch({
          type: "TRANSCRIPTION_UPDATED",
          result: {
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Failed to check transcription status",
          },
        })
      }
    }

    void poll()
  }, [])

  useEffect(() => {
    return (): void => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
    }
  }, [])

  const currentQuestion = state.questions[state.currentIndex]

  const handleRecordingComplete = useCallback(
    (blob: Blob, audioUrl: string, durationSeconds: number): void => {
      dispatch({ type: "RECORDING_COMPLETE", audioUrl, durationSeconds })

      if (!currentQuestion) return

      void transcriptionAdapterRef.current
        .submit(blob, {
          questionId: currentQuestion.id,
          category: currentQuestion.category,
          durationSeconds,
        })
        .then(({ jobId }) => pollTranscription(jobId))
        .catch((error: unknown) => {
          dispatch({
            type: "TRANSCRIPTION_UPDATED",
            result: {
              status: "error",
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to submit recording",
            },
          })
        })
    },
    [currentQuestion, pollTranscription]
  )

  const recording = useAudioRecorder(handleRecordingComplete)

  // Persist lightweight session progress (no blobs/urls) across reloads
  useEffect(() => {
    if (!persist) return
    if (state.phase === "welcome" || state.phase === "complete") return

    writePersistedSession({
      currentIndex: state.currentIndex,
      notes: state.notes,
      answers: state.answers,
      updatedAt: Date.now(),
    })
  }, [persist, state.phase, state.currentIndex, state.notes, state.answers])

  useEffect(() => {
    if (persist && state.phase === "complete") clearPersistedSession()
  }, [persist, state.phase])

  const actions = useMemo(
    () => ({
      start: (): void => dispatch({ type: "START" }),
      questionPlaybackDone: (): void =>
        dispatch({ type: "QUESTION_PLAYBACK_DONE" }),
      setNotes: (notes: string): void =>
        dispatch({ type: "NOTES_CHANGED", notes }),
      beginRecording: (): void => dispatch({ type: "BEGIN_RECORDING" }),
      editTranscript: (transcript: string): void =>
        dispatch({ type: "TRANSCRIPT_EDITED", transcript }),
      retryAnswer: (): void => {
        recording.reset()
        dispatch({ type: "RETRY_ANSWER" })
      },
      continueSession: (): void => {
        recording.reset()
        dispatch({ type: "CONTINUE" })
      },
      restart: (): void => {
        recording.reset()
        clearPersistedSession()
        dispatch({ type: "RESTART" })
      },
      resumeSession: (): void => {
        if (!resumeSnapshot) return
        dispatch({ type: "HYDRATE", snapshot: resumeSnapshot })
        dispatch({ type: "START" })
        setResumeSnapshot(null)
      },
      discardResume: (): void => {
        clearPersistedSession()
        setResumeSnapshot(null)
      },
    }),
    [recording, resumeSnapshot]
  )

  return {
    state,
    currentQuestion,
    isLastQuestion: state.currentIndex === state.questions.length - 1,
    progress: { current: state.currentIndex + 1, total: state.questions.length },
    recording,
    ttsAdapter,
    resumeAvailable: resumeSnapshot !== null,
    actions,
  }
}
