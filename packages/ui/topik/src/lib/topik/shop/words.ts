/**
 * What the shop says (KPLAY's KP4, #2853), in the person's terms: what is
 * kept where, never the machinery (`index.test.ts` holds it to that). A
 * phrase found is shown with the parts it is built from, as the shelf has
 * them (`phrases`).
 */
import { conjugate } from "@topik/lib/topik/conjugation"
import { CONSTRUCTIONS } from "@topik/lib/topik/constructions"
import type { Phrase } from "@topik/lib/topik/phrases"

export const SHOP_WORDS = {
  door: "Or say what you want to say",
  title: "What do you want to say?",
  lead: "Type it in English, the way you'd say it.",
  field: "What you want to say",
  example: "I can't find my phone",
  find: "Find it",
  looking: "Looking on home…",
  found: "Here's how it's said.",
  kept: "Nothing on the shelf says that yet. Home has kept your words, so a phrase for them may be on the shelf next time.",
  unknown:
    "Home found a phrase for that which this version of the app doesn't have yet.",
  unreached:
    "Home couldn't be reached. Your words are kept on this phone and go to home when it's next reachable.",
  retry: "Try again",
  again: "Something else",
  pick: "Add to my basket",
  putBack: "Take it out",
  basket: "In your basket",
  basketLasts: "Your basket lasts until you leave this screen.",
  back: "Back to the menu",
  builtFrom: "Built from",
  register: { 해요: "polite", 반말: "casual" },
  toWhom: {
    yourself: "to yourself",
    "a friend": "to a friend",
    anyone: "to anyone",
  },
  tense: { none: "", past: ", in the past", future: ", what will be" },
} as const satisfies {
  readonly register: Record<Phrase["register"], string>
  readonly toWhom: Record<Phrase["toWhom"], string>
  readonly [word: string]: unknown
}

/** One part of a phrase as the screen shows it. */
export type ShownPart = Readonly<{
  /** As it is written in the phrase. */
  written: string
  /** What it is made from, where that isn't the written word itself. */
  from: string | null
  gloss: string
}>

/** The parts `phrase` is built from, in reading order. */
export function shownParts(phrase: Phrase): ReadonlyArray<ShownPart> {
  return phrase.parts.map((part): ShownPart => {
    if (part.kind === "word")
      return {
        written: part.written,
        from: part.lemma === part.written ? null : part.lemma,
        gloss: part.gloss,
      }
    const { dictionary, ending, tense } = part.reading
    return {
      written: conjugate(part.reading),
      from: `${dictionary} + ${CONSTRUCTIONS[ending].form}${SHOP_WORDS.tense[tense]}`,
      gloss: part.gloss,
    }
  })
}

/** Who says `phrase`, and how: "polite, to anyone · everyday". */
export const saidHow = (phrase: Phrase): string =>
  `${SHOP_WORDS.register[phrase.register]}, ${SHOP_WORDS.toWhom[phrase.toWhom]} · ${phrase.setting}`
