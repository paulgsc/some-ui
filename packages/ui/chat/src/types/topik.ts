import { z } from "zod"

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

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(["assistant", "user"]),
  content: z.string(),
  timestamp: z.string(),
  korean: z.string(),
  english: z.string(),
})

const QuestionSchema = z.object({
  type: z.enum(["multiple-choice", "text-input"]),
  korean: z.string(),
  question: z.string(),
  options: z.array(z.string()).optional(),
  correct: z.number().optional(),
  acceptedAnswers: z.array(z.string()).optional(),
  correctAnswer: z.string(),
  explanation: z.string(),
  grammarNote: z.string().optional(),
})

const ConversationBatchSchema = z.object({
  id: z.number(),
  messages: z.array(MessageSchema),
  questions: z.array(QuestionSchema),
})

export const TopikFileSchema = z.array(ConversationBatchSchema)
export type TopikFile = z.infer<typeof TopikFileSchema>

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
