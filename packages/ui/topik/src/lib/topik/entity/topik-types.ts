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
  /**
   * The id of the message this question is about. Optional, authoring-time
   * (adaptive-learning canon Prop. 8.1): the handheld lesson presents a
   * check right after the line it anchors to and derives an anchor itself
   * when content declares none (Cor. 4.4 (ii)). The desktop quiz ignores it.
   */
  anchorMessageId?: string
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
  anchorMessageId: z.string().optional(),
})

// ═══════════════════════════════════════════════════════════════════════════
// MORPHISM PROBES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * How a candidate relates to the utterance it is judged against
 * (adaptive-learning canon Def. 4.6), named by whoever authored the probe:
 * "past", "reason: -아서 → -(으)니까", "reported speech". The set is open
 * (Rem. 4.8) - which transformation a probe tests is its content, like its
 * prompt, and the lesson never needs to know it. One name is reserved:
 * `GLOSS_RELATION`, a candidate that is the line's meaning, because the one
 * thing the lesson must refuse is a probe whose answer is a translation
 * (Prop. 4.2).
 */
export type MorphismRelation = string

export const GLOSS_RELATION = "gloss"

export type ProbeOption = {
  /** The candidate: an utterance, or a situation/meaning described in prose. */
  text: string
  relation: MorphismRelation
  /** Overrides the chip, which is otherwise the relation's own name. */
  label?: string
  /**
   * The answer key, authored. In an odd-one-out: whether `text` really
   * stands in `relation` to the source. In a pick-valid: whether it is the
   * one candidate the prompt asks for - which, for "which reply would be
   * rude?", is the infelicitous one.
   */
  valid: boolean
  /** One line on why it does or doesn't - the whole of the feedback. */
  why: string
  /** "ko" gets a diff against the source; "en" is prose. Default "ko". */
  lang?: "ko" | "en"
}

type ProbeBase = {
  /** Stable identity: first tries and reviews are keyed by it (Thm. 1.1). */
  id: string
  /** 2 = structure (tense, negation, ...), 3 = use (reply, register, ...). */
  order: 2 | 3
  /** The line this probe is about. */
  anchorMessageId?: string
  /** The utterance under test; defaults to the anchor line's Korean. */
  source?: string
  prompt: string
  explanation?: string
}

export type Probe =
  | (ProbeBase & {
      /** "Which of these is NOT a valid transformation?" - exactly one invalid. */
      kind: "odd-one-out"
      options: Array<ProbeOption>
    })
  | (ProbeBase & {
      /** "Which reply fits?" - exactly one valid. */
      kind: "pick-valid"
      options: Array<ProbeOption>
    })
  | (ProbeBase & {
      /** "Make it negative" - built from tiles (canon Def. 4.5). */
      kind: "build"
      relation: MorphismRelation
      target: string
      acceptedAnswers?: Array<string>
      /** Plausible wrong pieces for the tile board, authored. */
      distractors?: Array<string>
    })

const ProbeOptionSchema = z.object({
  text: z.string().min(1),
  relation: z.string().trim().min(1),
  label: z.string().optional(),
  valid: z.boolean(),
  why: z.string(),
  lang: z.enum(["ko", "en"]).optional(),
})

const probeBase = {
  id: z.string().min(1),
  order: z.union([z.literal(2), z.literal(3)]),
  anchorMessageId: z.string().optional(),
  source: z.string().optional(),
  prompt: z.string().min(1),
  explanation: z.string().optional(),
}

const countValid = (options: Array<{ valid: boolean }>): number =>
  options.filter((option) => option.valid).length

export const ProbeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...probeBase,
      kind: z.literal("odd-one-out"),
      options: z.array(ProbeOptionSchema).min(3),
    })
    .refine((p) => p.options.length - countValid(p.options) === 1, {
      message: "an odd-one-out probe has exactly one invalid option",
    }),
  z
    .object({
      ...probeBase,
      kind: z.literal("pick-valid"),
      options: z.array(ProbeOptionSchema).min(2),
    })
    .refine((p) => countValid(p.options) === 1, {
      message: "a pick-valid probe has exactly one valid option",
    }),
  z.object({
    ...probeBase,
    kind: z.literal("build"),
    relation: z.string().trim().min(1),
    target: z.string().min(1),
    acceptedAnswers: z.array(z.string()).optional(),
    distractors: z.array(z.string()).optional(),
  }),
])

/**
 * Probes parsed one at a time: a malformed probe is dropped, not the topik
 * that carries it (canon Rem. 4.7, Thm. 8.2). Content authored before probes
 * existed simply has none.
 */
const ProbesSchema = z.array(z.unknown()).transform(
  (raw): Array<Probe> =>
    raw.flatMap((candidate) => {
      const parsed = ProbeSchema.safeParse(candidate)
      return parsed.success ? [parsed.data] : []
    })
)

// ═══════════════════════════════════════════════════════════════════════════
// BATCH TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ConversationBatch = {
  id: number
  messages: Array<Message>
  /** First-order items; the desktop quiz. Withheld on handheld (Cor. 4.5). */
  questions: Array<Question>
  /** Second- and third-order items; the handheld checks. */
  probes?: Array<Probe>
}

const ConversationBatchSchema = z.object({
  id: z.number(),
  messages: z.array(MessageSchema),
  questions: z.array(QuestionSchema),
  probes: ProbesSchema.optional(),
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
