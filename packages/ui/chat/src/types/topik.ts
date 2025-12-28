export type Message = {
  id: string
  role: "assistant" | "user"
  content: string
  timestamp: string
  korean: string
  english: string
}

export type Question = {
  type: "multiple-choice" | "text-input"
  korean: string
  question: string
  options?: Array<string>
  correct?: number
  acceptedAnswers?: Array<string>
  correctAnswer: string
  explanation: string
  grammarNote?: string
}

export type ConversationBatch = {
  id: number
  messages: Array<Message>
  questions: Array<Question>
}

export type ChatPlayState = "not started" | "playing" | "paused" | "finished"
export type QuizState = "standby" | "ready" | "active" | "feedback" | "summary"

export type FeedbackData = {
  isCorrect: boolean
  questionType: "multiple-choice" | "text-input"
  userAnswer?: string
  correctAnswer?: string
  explanation: string
  grammarNote?: string
}

export type SessionState = {
  currentBatchIndex?: number
  chatPlayState: ChatPlayState
  currentMessageIndex?: number
  quizState: QuizState
  currentQuestion?: number
  score?: number
  timeRemaining?: number
  feedbackData?: FeedbackData
}
