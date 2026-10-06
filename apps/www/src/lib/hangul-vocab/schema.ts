import { z } from "zod"

/**
 * Mirrors `@some-ui/honeycomb`'s `WordEntry`
 * (packages/ui/honeycomb/src/data/hangul-words.ts): the contract a generated
 * vocab file must satisfy as a `HangulHexGrid` `words` override, validated
 * here before it reaches the component. `z.infer` stays assignable to
 * `WordEntry`.
 *
 * `answerKeys`/`answerGlyphs` must be verified against the dubeolsik mapping
 * (`packages/ui/honeycomb/src/utils/hangul-keyboard-mapping`): every jamo in
 * order, batchim included. The engine never re-derives them from `word`
 * (crates/hangul-game-core's
 * `batchim_word_completes_like_any_other_multi_token_challenge`).
 */
const WordPedagogySchema = z.object({
  gloss: z.string().min(1),
  note: z.string().min(1),
  example: z.object({
    korean: z.string().min(1),
    english: z.string().min(1),
  }),
})

export const WordEntrySchema = z
  .object({
    id: z.string().min(1),
    word: z.string().min(1),
    romanization: z.string().min(1),
    answerKeys: z.array(z.string().min(1)).min(1),
    answerGlyphs: z.array(z.string().min(1)).min(1),
    icon: z.string().min(1),
    ttsText: z.string().min(1),
    /** Free-form topic label (e.g. "numbers", "calendar") - not a closed enum. */
    category: z.string().min(1),
    /**
     * Debrief for a word the player ran out of time on. Optional so an older
     * vocab.json still loads; present-but-partial is rejected.
     */
    pedagogy: WordPedagogySchema.optional(),
  })
  .refine((entry) => entry.answerKeys.length === entry.answerGlyphs.length, {
    message:
      "answerKeys and answerGlyphs must be the same length - one QWERTY key per glyph, in order",
    path: ["answerGlyphs"],
  })

export const HangulVocabFileSchema = z.array(WordEntrySchema).min(1)
