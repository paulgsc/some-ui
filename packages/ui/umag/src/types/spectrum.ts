import { z } from "zod"

export const EventTypeSchema = z.enum([
  "ping",
  "pong",
  "error",
  "clientCount",
  "utterance",
])

// Regex for basic ISO 8601 timestamp validation (can be extended)
const isoTimestampRegex =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/

export const ElementInfoSchema = z.object({
  tagName: z.string(),
  type: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined), // null → undefined
  id: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  name: z.string().optional(),
  className: z.string().optional(),
  placeholder: z.string().optional(),
  formAction: z.string().optional(),
  formMethod: z.string().optional(),
  formId: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
})

// Type inference from schema
export type ElementInfo = z.infer<typeof ElementInfoSchema>

export const UtteranceMetadataSchema = z.object({
  url: z.string().url(),
  domain: z.string(),
  title: z.string(),
  timestamp: z.string().regex(isoTimestampRegex, {
    message: "Invalid timestamp format, expected ISO 8601",
  }),
  element: ElementInfoSchema,
})

export type UtteranceMetadata = z.infer<typeof UtteranceMetadataSchema>

export const UtterancePromptSchema = z.object({
  text: z.string(),
  metadata: UtteranceMetadataSchema,
})

export type UtterancePrompt = z.infer<typeof UtterancePromptSchema>

// Discriminated union for `Event` enum
export const EventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ping"),
  }),
  z.object({
    type: z.literal("pong"),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("subscribe"),
    event_types: z.array(EventTypeSchema),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    event_types: z.array(EventTypeSchema),
  }),
  z.object({
    type: z.literal("clientCount"),
    count: z.number().nonnegative(),
  }),

  z.object({
    type: z.literal("utterance"),
    text: z.string(),
    metadata: UtteranceMetadataSchema,
  }),
])

export type IncomingEvent = z.infer<typeof EventSchema>

export type WsEvents = z.infer<typeof EventSchema>

export type SpectrumBarConfig = {
  id: number
  x: number
  baseHeight: number
  activeHeight: number
  width: number
  animationDelay: number
  frequency: number
}
