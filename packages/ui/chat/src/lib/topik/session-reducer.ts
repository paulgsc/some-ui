import type { ConversationBatch } from "@chat/types/topik"

export type SessionPhase =
  | "selecting"
  | "loadingBatches"
  | "idle"
  | "chatPlaying"
  | "chatPaused"
  | "quizReady"
  | "quizActive"
  | "quizFeedback"
  | "quizSummary"
  | "sessionComplete"

export type SessionState = {
  phase: SessionPhase
  topikKey: string | null
  batches: Array<ConversationBatch> // TODO: This file can be very large!!!
  batchIndex: number
  messageIndex: number
  questionIndex: number
  score: number
  timeRemaining: number
  feedbackData?: {
    isCorrect: boolean
    questionType: "multiple-choice" | "text-input"
    userAnswer?: string
    correctAnswer?: string
    explanation: string
    grammarNote?: string
  }
}

export type SessionEvent =
  | { type: "SELECT_TOPIK"; topikKey: string }
  | { type: "BATCHES_LOADED"; batches: Array<ConversationBatch> } // async result
  | { type: "BATCHES_FAILED"; error: string } // async error
  | { type: "CHANGE_TOPIK" }
  | { type: "START_CHAT" }
  | { type: "PAUSE_CHAT" }
  | { type: "RESUME_CHAT" }
  | { type: "RESET_CHAT" }
  | { type: "MESSAGE_SPOKEN" }
  | { type: "JUMP_TO_MESSAGE"; index: number }
  | { type: "START_QUIZ" }
  | { type: "ANSWER_SUBMITTED"; correct: boolean; userAnswer?: string }
  | { type: "NEXT_QUESTION" }
  | { type: "ASSESSMENT_PASSED" }
  | { type: "ASSESSMENT_FAILED" }
  | { type: "TICK" }

export function sessionReducer(
  state: SessionState,
  event: SessionEvent
): SessionState {
  const batch = state.batches.at(state.batchIndex)

  switch (state.phase) {
    case "selecting": {
      if (event.type === "SELECT_TOPIK") {
        return {
          ...state,
          phase: "loadingBatches",
          topikKey: event.topikKey,
        }
      }
      return state
    }
    case "loadingBatches": {
      if (event.type === "BATCHES_LOADED") {
        return {
          ...state,
          phase: "idle",
          batches: event.batches,
          batchIndex: 0,
          messageIndex: 0,
          questionIndex: 0,
          score: 0,
          timeRemaining: 180,
          feedbackData: undefined,
        }
      }

      if (event.type === "BATCHES_FAILED") {
        // Return to selection on error
        return {
          ...state,
          phase: "selecting",
          topikKey: null,
        }
      }

      if (event.type === "CHANGE_TOPIK") {
        return {
          ...state,
          phase: "selecting",
          topikKey: null,
          batches: [],
        }
      }

      return state
    }
    case "idle": {
      if (event.type === "CHANGE_TOPIK") {
        return {
          ...state,
          phase: "selecting",
          topikKey: null,
          batches: [],
          batchIndex: 0,
          messageIndex: 0,
          questionIndex: 0,
          score: 0,
          feedbackData: undefined,
        }
      }
      if (event.type === "START_CHAT") {
        return {
          ...state,
          phase: "chatPlaying",
          messageIndex: 0,
          timeRemaining: 180,
          score: 0,
          feedbackData: undefined,
        }
      }
      return state
    }

    case "chatPlaying": {
      if (event.type === "CHANGE_TOPIK") {
        return {
          ...state,
          phase: "selecting",
          topikKey: null,
          batches: [],
          batchIndex: 0,
          messageIndex: 0,
          questionIndex: 0,
          score: 0,
          feedbackData: undefined,
        }
      }
      if (event.type === "PAUSE_CHAT") {
        return { ...state, phase: "chatPaused" }
      }

      if (event.type === "RESET_CHAT") {
        return {
          ...state,
          phase: "idle",
          messageIndex: 0,
          questionIndex: 0,
          score: 0,
          feedbackData: undefined,
        }
      }

      if (event.type === "JUMP_TO_MESSAGE") {
        return { ...state, messageIndex: event.index }
      }

      if (event.type === "MESSAGE_SPOKEN") {
        const nextIndex = state.messageIndex + 1

        // All messages complete → transition to quiz
        if (batch && nextIndex >= batch.messages.length) {
          return { ...state, phase: "quizReady" }
        }

        return { ...state, messageIndex: nextIndex }
      }

      if (event.type === "TICK" && state.timeRemaining > 0) {
        return { ...state, timeRemaining: state.timeRemaining - 1 }
      }

      return state
    }

    case "chatPaused": {
      if (event.type === "CHANGE_TOPIK") {
        return {
          ...state,
          phase: "selecting",
          batches: [],
          topikKey: null,
          batchIndex: 0,
          messageIndex: 0,
          questionIndex: 0,
          score: 0,
          feedbackData: undefined,
        }
      }
      if (event.type === "RESUME_CHAT") {
        return { ...state, phase: "chatPlaying" }
      }

      if (event.type === "RESET_CHAT") {
        return {
          ...state,
          phase: "idle",
          messageIndex: 0,
          questionIndex: 0,
          score: 0,
          feedbackData: undefined,
        }
      }

      if (event.type === "JUMP_TO_MESSAGE") {
        return { ...state, messageIndex: event.index }
      }

      return state
    }

    case "quizReady": {
      if (event.type === "CHANGE_TOPIK") {
        return {
          ...state,
          phase: "selecting",
          topikKey: null,
          batches: [],
          batchIndex: 0,
          messageIndex: 0,
          questionIndex: 0,
          score: 0,
          feedbackData: undefined,
        }
      }
      if (event.type === "START_QUIZ") {
        return {
          ...state,
          phase: "quizActive",
          questionIndex: 0,
        }
      }
      return state
    }

    case "quizActive": {
      if (event.type === "CHANGE_TOPIK") {
        return {
          ...state,
          phase: "selecting",
          topikKey: null,
          batches: [],
          batchIndex: 0,
          messageIndex: 0,
          questionIndex: 0,
          score: 0,
          feedbackData: undefined,
        }
      }
      if (batch && event.type === "ANSWER_SUBMITTED") {
        const question = batch.questions.at(state.questionIndex)
        if (!question) return state

        return {
          ...state,
          phase: "quizFeedback",
          score: event.correct ? state.score + 1 : state.score,
          feedbackData: {
            isCorrect: event.correct,
            questionType: question.type,
            userAnswer: event.userAnswer,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
            grammarNote: question.grammarNote,
          },
        }
      }
      return state
    }

    case "quizFeedback": {
      if (event.type === "CHANGE_TOPIK") {
        return {
          ...state,
          phase: "selecting",
          topikKey: null,
          batches: [],
          batchIndex: 0,
          messageIndex: 0,
          questionIndex: 0,
          score: 0,
          feedbackData: undefined,
        }
      }
      if (batch && event.type === "NEXT_QUESTION") {
        const nextQuestionIndex = state.questionIndex + 1

        // All questions complete → show summary
        if (nextQuestionIndex >= batch.questions.length) {
          return { ...state, phase: "quizSummary", feedbackData: undefined }
        }

        return {
          ...state,
          phase: "quizActive",
          questionIndex: nextQuestionIndex,
          feedbackData: undefined,
        }
      }
      return state
    }

    case "quizSummary": {
      if (event.type === "CHANGE_TOPIK") {
        return {
          ...state,
          phase: "selecting",
          topikKey: null,
          batchIndex: 0,
          messageIndex: 0,
          questionIndex: 0,
          score: 0,
          feedbackData: undefined,
        }
      }
      if (event.type === "ASSESSMENT_FAILED") {
        // Retry current batch
        return {
          ...state,
          phase: "idle",
          messageIndex: 0,
          batches: [],
          questionIndex: 0,
          score: 0,
          timeRemaining: 180,
          feedbackData: undefined,
        }
      }

      if (event.type === "ASSESSMENT_PASSED") {
        const nextBatchIndex = state.batchIndex + 1

        // All batches complete
        if (nextBatchIndex >= batches.length) {
          return { ...state, phase: "sessionComplete" }
        }

        // Advance to next batch - auto-start it
        return {
          ...state,
          phase: "chatPlaying",
          batchIndex: nextBatchIndex,
          messageIndex: 0,
          questionIndex: 0,
          score: 0,
          timeRemaining: 180,
          feedbackData: undefined,
        }
      }
      return state
    }

    case "sessionComplete": {
      if (event.type === "CHANGE_TOPIK") {
        return {
          ...state,
          phase: "selecting",
          topikKey: null,
          batches: [],
          batchIndex: 0,
          messageIndex: 0,
          questionIndex: 0,
          score: 0,
          feedbackData: undefined,
        }
      }
      // Terminal state
      return state
    }

    default:
      return state
  }
}

/* ═══════════════════════════════════════════════════════════
   INITIAL STATE FACTORY
   ═══════════════════════════════════════════════════════════ */

export function createInitialState(): SessionState {
  return {
    phase: "selecting",
    topikKey: null,
    batches: [],
    batchIndex: 0,
    messageIndex: 0,
    questionIndex: 0,
    score: 0,
    timeRemaining: 180,
  }
}
