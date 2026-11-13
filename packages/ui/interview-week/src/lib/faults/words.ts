import { z } from "zod"

import FILLERS_FILE from "./fillers.json"

/**
 * One word home heard, as `some-ui.voice-transcript/1` carries it in `words`
 * (apps/mailbox `wordsRefusal`): its text, when it began and ended in the
 * take (milliseconds from the take's start), and how sure the transcriber
 * was (`p`, 0–1, absent when it gave none).
 */
export const HeardWordSchema = z.object({
  text: z.string(),
  startMs: z.int().nonnegative(),
  endMs: z.int().nonnegative(),
  p: z.number().min(0).max(1).optional(),
  language: z.string().optional(),
})
export type HeardWord = z.infer<typeof HeardWordSchema>

/** At most a transcript's words (apps/mailbox `WORDS_MAX`). */
const WORDS_MAX = 12_000

export const HeardWordsSchema = z
  .array(HeardWordSchema)
  .max(WORDS_MAX)
  .refine((words) => words.every((word) => word.endMs >= word.startMs), {
    message: "a word ends before it starts",
  })

/** The parts of a transcript file the measures read; the rest is ignored. */
const TranscriptWordsSchema = z.object({
  schema: z.literal("some-ui.voice-transcript/1"),
  words: HeardWordsSchema,
})

/**
 * The words of a transcript file's body, or null when the body is not a
 * `some-ui.voice-transcript/1` with well-formed words. A transcript from
 * before words were kept has none, and is null too.
 */
export function wordsOf(body: unknown): ReadonlyArray<HeardWord> | null {
  const parsed = TranscriptWordsSchema.safeParse(body)
  return parsed.success ? parsed.data.words : null
}

const FillersFileSchema = z.object({
  schema: z.literal("some-ui.fillers/1"),
  about: z.string(),
  fillers: z.array(z.string().regex(/^[a-z]+$/)).min(1),
})

/** The closed filler list (`fillers.json`, C265). */
export const FILLERS: ReadonlySet<string> = new Set(
  FillersFileSchema.parse(FILLERS_FILE).fillers
)

const APOSTROPHE = /['’]/g
const TOKEN = /[\p{L}\p{N}]+/gu

/**
 * The comparable words in a piece of text: lowercased, apostrophes dropped
 * ("don't" is "dont"), split at anything that is not a letter or digit
 * ("well-known" is two). Punctuation alone is no word.
 */
export function tokens(text: string): Array<string> {
  return normalised(text).match(TOKEN) ?? []
}

/** Text as words are compared: composed, lowercased, without apostrophes. */
export function normalised(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(APOSTROPHE, "")
}

/** A comparable word with the timing of the heard word it came from. */
export type SpokenToken = {
  token: string
  startMs: number
  endMs: number
  p: number | undefined
  filler: boolean
}

/**
 * The heard words as comparable words, in the order they were spoken. A heard
 * word that is punctuation alone gives none; one with a hyphen gives one per
 * part, each with the whole word's timing.
 */
export function spokenTokens(
  words: ReadonlyArray<HeardWord>
): Array<SpokenToken> {
  const ordered = words
    .map((word, index) => ({ word, index }))
    .sort((a, b) => a.word.startMs - b.word.startMs || a.index - b.index)
  return ordered.flatMap(({ word }) =>
    tokens(word.text).map((token) => ({
      token,
      startMs: word.startMs,
      endMs: word.endMs,
      p: word.p,
      filler: FILLERS.has(token),
    }))
  )
}
