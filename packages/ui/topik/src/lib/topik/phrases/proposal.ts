/**
 * A proposed phrase, checked before the owner sees it (KPLAY's KP5, #2854).
 * It is for the routine's answer to a hunch that found nothing, once kept
 * hunches reach it (KP4, KP5), and `check:phrase` runs it on a proposal
 * written as JSON: the proposal is refused unless its shape holds (every
 * predicate a word on the vocabulary list, every ending one in the
 * catalogue), its id is new to the shelf, no entry already says the same
 * sentence, and `checkPhrase` finds no fault. A proposal is always
 * `proposed` and heard in the AI voice: only the owner accepts a phrase
 * (#2852), and a proposal brings no audio.
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
import {
  PHRASE_IDS,
  PHRASES,
  type PhraseId,
} from "@topik/lib/topik/phrases/shelf"
import { hangulRuns, WordSchema } from "@topik/lib/topik/read-aloud/content"
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
    ...WordSchema.pick({ lemma: true, gloss: true }).shape,
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

/**
 * The same sentence: the same words, asking or not. A comma, or "!" for ".",
 * does not make another phrase.
 */
const sameSentence = (a: string, b: string): boolean =>
  hangulRuns(a).join(" ") === hangulRuns(b).join(" ") &&
  a.endsWith("?") === b.endsWith("?")

/** Something that keeps a proposal from reaching the owner. */
type ProposalFault =
  | PhraseFault
  | Readonly<{ kind: "id-taken" }>
  /** The shelf already says this sentence: a new intent for it, not a copy. */
  | Readonly<{ kind: "korean-taken"; id: PhraseId }>

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
  const same = PHRASE_IDS.find((landed) =>
    sameSentence(PHRASES[landed].korean, phrase.korean)
  )
  return {
    ok: true,
    id,
    phrase,
    faults: [
      ...(taken ? [{ kind: "id-taken" } as const] : []),
      ...(same === undefined
        ? []
        : [{ kind: "korean-taken", id: same } as const]),
      ...checkPhrase(phrase),
    ],
  }
}
