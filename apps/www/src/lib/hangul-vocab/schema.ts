import { z } from "zod"

/**
 * Mirrors `@some-ui/honeycomb`'s `WordEntry`
 * (packages/ui/honeycomb/src/data/hangul-words.ts) - this is the contract an
 * LLM-generated vocab file must satisfy to be usable as a `HangulHexGrid`
 * `words` override. Kept as an independent schema (not imported from
 * honeycomb, which has no zod dependency of its own for this type) so
 * `apps/www` can validate the fetched JSON before it ever reaches the
 * component; `z.infer` below stays structurally assignable to `WordEntry`
 * because the field types match exactly.
 *
 * `answerKeys`/`answerGlyphs` must be hand-verified (or LLM-verified) against
 * the dubeolsik QWERTY mapping table
 * (`packages/ui/honeycomb/src/utils/hangul-keyboard-mapping`) - every jamo in
 * the word, in order, including batchim (there is no open-syllable
 * restriction: the mapping table is position-agnostic, and the engine never
 * re-derives these from `word` at runtime - see hangul-words.ts's header
 * comment and crates/hangul-game-core/src/internal/engine.rs's
 * `batchim_word_completes_like_any_other_multi_token_challenge` test).
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
     * Debrief content for a word the player ran out of time on. Optional on
     * purpose: a generated file that omits it still plays, it just gets a
     * reveal with no prose behind it, so an older vocab.json on disk never
     * becomes unloadable. Present-but-partial is still rejected - half a
     * debrief is worse than none.
     */
    pedagogy: WordPedagogySchema.optional(),
  })
  .refine((entry) => entry.answerKeys.length === entry.answerGlyphs.length, {
    message:
      "answerKeys and answerGlyphs must be the same length - one QWERTY key per glyph, in order",
    path: ["answerGlyphs"],
  })

export const HangulVocabFileSchema = z.array(WordEntrySchema).min(1)
