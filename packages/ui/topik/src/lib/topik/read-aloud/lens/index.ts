/**
 * The grammar lens: one question a sentence rep carries while it runs
 * (adaptive-learning canon Def. 4.8, Rem. 4.9, Prop. 6.4).
 *
 * A lens asks either which written word plays a role (누가? 어디서?) or which
 * tense the line is in. The learner answers by tapping, at any point before
 * the gloss, and the gloss shows the answer either way: nothing waits for
 * the tap, so a rep the learner only reads runs exactly as it would without
 * a lens.
 *
 * A lens holds no belief about the learner. Which one a sentence carries is
 * drawn from the set's seed, uniformly over the lenses its line supports
 * (Rem. 4.9), and an answer moves neither a word's pace nor what a rep
 * counts (Cor. 4.6 (iii), Prop. 6.4): the set machine only tallies it for the
 * set's summary.
 */

import { fnv1a } from "@some-ui/core-utils"
import type {
  GrammarRole,
  ReadAloudLine,
  Tense,
} from "@topik/lib/topik/read-aloud/content"
import { GRAMMAR_ROLES } from "@topik/lib/topik/read-aloud/content"

/**
 * What a lens asks. `word` and `from` index the line's occurrences, which are
 * also its written words in order (`parseReadAloudDeck` keeps no line where
 * they differ).
 */
export type Lens =
  /** Which word plays `role`: exactly one in the line does. */
  | { kind: "role"; role: GrammarRole; word: number }
  /** Which tense: shown on the words from `from`, its last predicate, on. */
  | { kind: "tense"; tense: Tense; from: number }

export type LensAnswer =
  | { kind: "word"; word: number }
  | { kind: "tense"; tense: Tense }

/** How a lens ended: answered rightly, answered wrongly, or not answered. */
export type LensOutcome = "found" | "missed" | "unanswered"

const PREDICATES: ReadonlySet<GrammarRole | undefined> = new Set([
  "action",
  "describing",
])

/** Where a line's tense shows: its last predicate, else its last word. */
function tenseFrom(line: ReadAloudLine): number {
  for (let index = line.words.length - 1; index >= 0; index -= 1) {
    if (PREDICATES.has(line.words[index]?.role)) return index
  }
  return line.words.length - 1
}

/**
 * Every lens a line supports: each role exactly one of its words plays, so
 * the question has one answer, then its tense when it has one.
 */
export function lensesOf(line: ReadAloudLine): Array<Lens> {
  const lenses: Array<Lens> = []
  for (const role of GRAMMAR_ROLES) {
    const words = line.words.flatMap((word, index) =>
      word.role === role ? [index] : []
    )
    const [word] = words
    if (words.length === 1 && word !== undefined) {
      lenses.push({ kind: "role", role, word })
    }
  }
  if (line.tense !== undefined) {
    lenses.push({ kind: "tense", tense: line.tense, from: tenseFrom(line) })
  }
  return lenses
}

/** The lens a line carries in a set drawn with `seedKey`; null if none fits. */
export function pickLens(line: ReadAloudLine, seedKey: string): Lens | null {
  const lenses = lensesOf(line)
  if (lenses.length === 0) return null
  return lenses[fnv1a(`${seedKey}:lens:${line.id}`) % lenses.length] ?? null
}

/** Whether an answer is the kind a lens asks for: a word, or a tense. */
export const answers = (lens: Lens, answer: LensAnswer): boolean =>
  (lens.kind === "role") === (answer.kind === "word")

export const sameAnswer = (a: LensAnswer, b: LensAnswer): boolean =>
  a.kind === "word"
    ? b.kind === "word" && a.word === b.word
    : b.kind === "tense" && a.tense === b.tense

export function lensOutcome(
  lens: Lens,
  answer: LensAnswer | null
): LensOutcome {
  if (answer === null || !answers(lens, answer)) return "unanswered"
  const found =
    lens.kind === "role"
      ? answer.kind === "word" && answer.word === lens.word
      : answer.kind === "tense" && answer.tense === lens.tense
  return found ? "found" : "missed"
}

/** The words a lens's answer is shown on, at the gloss. */
export function lensWords(lens: Lens, wordCount: number): Array<number> {
  if (lens.kind === "role") return [lens.word]
  return Array.from(
    { length: Math.max(0, wordCount - lens.from) },
    (_, n) => lens.from + n
  )
}
