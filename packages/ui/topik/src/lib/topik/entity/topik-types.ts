/**
 * Topik Domain Types
 *
 * These types represent the domain model for Korean language learning content
 */

import { z } from "zod"

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type Message = {
  id: string
  role: "assistant" | "user"
  content: string
  timestamp: string
  korean: string
  english: string
}

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(["assistant", "user"]),
  content: z.string(),
  timestamp: z.string(),
  korean: z.string(),
  english: z.string(),
})

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION TYPES
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// BATCH TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ConversationBatch = {
  id: number
  messages: Array<Message>
  questions: Array<Question>
}

const ConversationBatchSchema = z.object({
  id: z.number(),
  messages: z.array(MessageSchema),
  questions: z.array(QuestionSchema),
})

// ═══════════════════════════════════════════════════════════════════════════
// FILE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Schema for topik files
 * A topik file is an array of conversation batches
 */
export const TopikFileSchema = z.array(ConversationBatchSchema)

export type TopikFile = z.infer<typeof TopikFileSchema>
