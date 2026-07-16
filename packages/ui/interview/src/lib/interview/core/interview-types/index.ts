/**
 * Interview Domain Types
 *
 * Framework-agnostic types for the mock-interview session. Mirrors the
 * core/adapter split used by `lib/topik` so the same session state can
 * eventually be rendered by more than one presentation (paginated
 * slideshow today, animated chat/voice later).
 */

import { z } from "zod"

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION
// ═══════════════════════════════════════════════════════════════════════════

export type QuestionLevel = "junior" | "mid" | "senior"

export type QuestionCategory =
  | "behavioral"
  | "system-design"
  | "technical"
  | "leadership"

export type Question = {
  id: string
  level: QuestionLevel
  category: QuestionCategory
  question: string
  durationSeconds: number
}

export const QuestionSchema = z.object({
  id: z.string(),
  level: z.enum(["junior", "mid", "senior"]),
  category: z.enum(["behavioral", "system-design", "technical", "leadership"]),
  question: z.string(),
  durationSeconds: z.number().positive(),
})

// ═══════════════════════════════════════════════════════════════════════════
// TRANSCRIPTION
// ═══════════════════════════════════════════════════════════════════════════

export type TranscriptionStatus = "pending" | "processing" | "done" | "error"

export type TranscriptionResult = {
  status: TranscriptionStatus
  transcript?: string
  error?: string
}

export type TranscriptionJob = {
  jobId: string
}

export const TranscriptionResultSchema = z.object({
  status: z.enum(["pending", "processing", "done", "error"]),
  transcript: z.string().optional(),
  error: z.string().optional(),
})

export const TranscriptionJobSchema = z.object({
  jobId: z.string(),
})

/**
 * Seam for the future transcription backend. `submit` hands off a
 * recording, `poll` is called until it resolves to a terminal status
 * ("done" | "error"). Swapping the mock for an HTTP-backed adapter is a
 * one-line change at the call site.
 */
export type TranscriptionAdapter = {
  submit(
    blob: Blob,
    meta: {
      questionId: string
      category: QuestionCategory
      durationSeconds: number
    }
  ): Promise<TranscriptionJob>
  poll(jobId: string): Promise<TranscriptionResult>
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION REPOSITORY
// ═══════════════════════════════════════════════════════════════════════════

export type QuestionRepository = {
  list(filters?: {
    level?: QuestionLevel
    category?: QuestionCategory
  }): Promise<Array<Question>>
}

// ═══════════════════════════════════════════════════════════════════════════
// TTS (question playback)
// ═══════════════════════════════════════════════════════════════════════════

export type SpeakOptions = {
  onBoundary?: (charIndex: number, charLength: number) => void
}

export type InterviewTTSAdapter = {
  supported: boolean
  speak(text: string, opts?: SpeakOptions): Promise<void>
  stop(): void
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION PHASES
// ═══════════════════════════════════════════════════════════════════════════

export type InterviewPhase =
  | "welcome"
  | "question"
  | "preparation"
  | "recording"
  | "transcribing"
  | "review"
  | "complete"

export type SessionAnswer = {
  questionId: string
  transcript: string
  notes: string
  durationSeconds: number
}

const SessionAnswerSchema = z.object({
  questionId: z.string(),
  transcript: z.string(),
  notes: z.string(),
  durationSeconds: z.number(),
})

export type InterviewSessionState = {
  phase: InterviewPhase
  questions: Array<Question>
  currentIndex: number
  notes: string
  audioUrl: string | null
  recordingDurationSeconds: number
  transcription: TranscriptionResult | null
  answers: Array<SessionAnswer>
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION EVENTS
// ═══════════════════════════════════════════════════════════════════════════

export type InterviewEvent =
  | { type: "QUESTIONS_LOADED"; questions: Array<Question> }
  | { type: "START" }
  | { type: "QUESTION_PLAYBACK_DONE" }
  | { type: "NOTES_CHANGED"; notes: string }
  | { type: "BEGIN_RECORDING" }
  | {
      type: "RECORDING_COMPLETE"
      audioUrl: string
      durationSeconds: number
    }
  | { type: "TRANSCRIPTION_UPDATED"; result: TranscriptionResult }
  | { type: "TRANSCRIPT_EDITED"; transcript: string }
  | { type: "RETRY_ANSWER" }
  | { type: "CONTINUE" }
  | { type: "RESTART" }
  | { type: "HYDRATE"; snapshot: PersistedSnapshot }

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The only part of session state worth persisting across reloads. Audio
 * blobs and object URLs are intentionally excluded - they don't survive
 * serialization and shouldn't live in storage anyway.
 */
export type PersistedSnapshot = {
  currentIndex: number
  notes: string
  answers: Array<SessionAnswer>
  updatedAt: number
}

export const PersistedSnapshotSchema = z.object({
  currentIndex: z.number(),
  notes: z.string(),
  answers: z.array(SessionAnswerSchema),
  updatedAt: z.number(),
})
