/**
 * A proposed phrase, checked before the owner sees it (KPLAY's KP5, #2854).
 * The routine writes a proposal as JSON for a hunch that found nothing, and
 * `check:phrase` runs this on it: the proposal is refused unless its shape
 * holds (every predicate a word on the vocabulary list, every ending one in
 * the catalogue), its id is new to the shelf, and `checkPhrase` finds no
 * fault. A proposal is always `proposed` and heard in the AI voice: only the
 * owner accepts a phrase (#2852), and a proposal brings no audio.
 */

import type { Reading } from "@topik/lib/topik/conjugation"
import {
  isListed,
  type Dictionary,
} from "@topik/lib/topik/conjugation/vocabulary"
import {
  CONSTRUCTION_IDS,
  type ClauseMood,
} from "@topik/lib/topik/constructions"
import {
  checkPhrase,
  type Phrase,
  type PhraseFault,
} from "@topik/lib/topik/phrases"
import { PHRASE_IDS } from "@topik/lib/topik/phrases/shelf"
import { HANGUL } from "@topik/lib/topik/read-aloud/content"
import { z } from "zod"

/** Every value of each closed set, checked complete by the compiler. */
const MOODS: Record<ClauseMood, true> = {
  statement: true,
  question: true,
  command: true,
  suggestion: true,
}
const REGISTERS: Record<Phrase["register"], true> = { 해요: true, 반말: true }
const TO_WHOM: Record<Phrase["toWhom"], true> = {
  yourself: true,
  "a friend": true,
  anyone: true,
}

const oneOf = <T extends string>(
  set: Record<T, true>,
  what: string
): z.ZodType<T> =>
  z.custom<T>(
    (value) => typeof value === "string" && Object.hasOwn(set, value),
    `not a ${what}`
  )

const Text = z.string().trim().min(1)

const TENSES: Record<Reading["tense"], true> = {
  none: true,
  past: true,
  future: true,
}

// Strict at every level: a key the proposal may not set (its status, its
// audio) or misspells is refused, never dropped.
const PartSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("word"),
    written: z.string(),
    lemma: z.string().regex(HANGUL, "a lemma is Hangul syllables"),
    gloss: Text,
  }),
  z.strictObject({
    kind: z.literal("built"),
    reading: z.strictObject({
      dictionary: z.custom<Dictionary>(
        (value) => typeof value === "string" && isListed(value),
        "not a word on the vocabulary list"
      ),
      ending: z.enum(CONSTRUCTION_IDS),
      tense: oneOf(TENSES, "tense"),
    }),
    gloss: Text,
  }),
])

const ProposalSchema = z.strictObject({
  id: z
    .string()
    .regex(/^ph\.[a-z0-9]+(?:-[a-z0-9]+)*$/, "ids are ph.kebab-case"),
  korean: Text,
  intents: z.tuple([Text], Text),
  register: oneOf(REGISTERS, "register"),
  toWhom: oneOf(TO_WHOM, "listener"),
  setting: Text,
  mood: oneOf(MOODS, "mood"),
  parts: z.array(PartSchema).nonempty(),
})

/** Something that keeps a proposal from reaching the owner. */
type ProposalFault = PhraseFault | Readonly<{ kind: "id-taken" }>

export type CheckedProposal =
  | Readonly<{
      ok: true
      id: string
      phrase: Phrase
      faults: ReadonlyArray<ProposalFault>
    }>
  | Readonly<{ ok: false; error: string }>

/** A proposal's shape, then every fault in it; none for one to put forward. */
export const checkProposal = (raw: unknown): CheckedProposal => {
  const parsed = ProposalSchema.safeParse(raw)
  if (!parsed.success)
    return { ok: false, error: z.prettifyError(parsed.error) }
  const { id, ...rest } = parsed.data
  const phrase: Phrase = { ...rest, hear: "ai-voice", status: "proposed" }
  const taken = PHRASE_IDS.some((landed) => landed === id)
  return {
    ok: true,
    id,
    phrase,
    faults: [
      ...(taken ? [{ kind: "id-taken" } as const] : []),
      ...checkPhrase(phrase),
    ],
  }
}
