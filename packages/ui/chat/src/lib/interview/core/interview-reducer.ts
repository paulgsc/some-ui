import type {
  InterviewEvent,
  InterviewSessionState,
  SessionAnswer,
} from "@chat/lib/interview/core/interview-types"

export const createInitialInterviewState = (): InterviewSessionState => ({
  phase: "welcome",
  questions: [],
  currentIndex: 0,
  notes: "",
  audioUrl: null,
  recordingDurationSeconds: 0,
  transcription: null,
  answers: [],
})

const buildAnswer = (state: InterviewSessionState): SessionAnswer => {
  const question = state.questions[state.currentIndex]
  return {
    questionId: question?.id ?? "unknown",
    transcript: state.transcription?.transcript ?? "",
    notes: state.notes,
    durationSeconds: state.recordingDurationSeconds,
  }
}

export const interviewReducer = (
  state: InterviewSessionState,
  event: InterviewEvent
): InterviewSessionState => {
  switch (event.type) {
    case "QUESTIONS_LOADED":
      return { ...state, questions: event.questions }

    case "START":
      return state.phase === "welcome" && state.questions.length > 0
        ? { ...state, phase: "question" }
        : state

    case "QUESTION_PLAYBACK_DONE":
      return state.phase === "question"
        ? { ...state, phase: "preparation" }
        : state

    case "NOTES_CHANGED":
      return { ...state, notes: event.notes }

    case "BEGIN_RECORDING":
      return state.phase === "preparation"
        ? { ...state, phase: "recording" }
        : state

    case "RECORDING_COMPLETE":
      return state.phase === "recording"
        ? {
            ...state,
            phase: "transcribing",
            audioUrl: event.audioUrl,
            recordingDurationSeconds: event.durationSeconds,
            transcription: { status: "pending" },
          }
        : state

    case "TRANSCRIPTION_UPDATED": {
      if (state.phase !== "transcribing" && state.phase !== "review") {
        return state
      }
      const isTerminal =
        event.result.status === "done" || event.result.status === "error"
      return {
        ...state,
        transcription: event.result,
        phase: isTerminal ? "review" : state.phase,
      }
    }

    case "TRANSCRIPT_EDITED":
      return state.phase === "review" && state.transcription
        ? {
            ...state,
            transcription: { ...state.transcription, transcript: event.transcript },
          }
        : state

    case "RETRY_ANSWER":
      return state.phase === "review"
        ? {
            ...state,
            phase: "preparation",
            audioUrl: null,
            recordingDurationSeconds: 0,
            transcription: null,
          }
        : state

    case "CONTINUE": {
      if (state.phase !== "review") return state
      const answers = [...state.answers, buildAnswer(state)]
      const isLast = state.currentIndex === state.questions.length - 1

      if (isLast) {
        return {
          ...state,
          answers,
          phase: "complete",
          audioUrl: null,
          recordingDurationSeconds: 0,
          transcription: null,
        }
      }

      return {
        ...state,
        answers,
        currentIndex: state.currentIndex + 1,
        phase: "question",
        notes: "",
        audioUrl: null,
        recordingDurationSeconds: 0,
        transcription: null,
      }
    }

    case "RESTART":
      return {
        ...createInitialInterviewState(),
        questions: state.questions,
      }

    case "HYDRATE":
      return {
        ...state,
        currentIndex: Math.min(
          event.snapshot.currentIndex,
          Math.max(state.questions.length - 1, 0)
        ),
        notes: event.snapshot.notes,
        answers: event.snapshot.answers,
      }

    default:
      return state
  }
}
