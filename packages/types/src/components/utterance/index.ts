import { z } from "zod"

export const UtteranceEventTypeSchema = z.enum([
  "ping",
  "pong",
  "error",
  "clientCount",
  "utterance",
])

export type UtteranceEvents = z.infer<typeof UtteranceEventTypeSchema>

const isoTimestampRegex =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/

export const ElementInfoSchema = z.object({
  tagName: z.string(),
  type: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  id: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  name: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  className: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  placeholder: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  formMethod: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  formAction: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
  formId: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? undefined),
})

export const UtteranceMetadataSchema = z.object({
  url: z.url(),
  domain: z.string(),
  title: z.string(),
  timestamp: z.string().regex(isoTimestampRegex, {
    message: "Invalid timestamp format, expected ISO 8601",
  }),
  element: ElementInfoSchema,
})

export const UtterancePromptSchema = z.object({
  text: z.string(),
  metadata: UtteranceMetadataSchema,
})

export type UtterancePrompt = z.infer<typeof UtterancePromptSchema>
