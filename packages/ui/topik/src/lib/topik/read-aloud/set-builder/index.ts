/**
 * Read-aloud sets: which items a set presents, and in what order
 * (adaptive-learning canon Def. 4.8, Cor. 4.6 (i), Rem. 4.9).
 *
 * A set mixes words with sentences of several lengths. Its order is drawn
 * afresh for each set, uniformly, with one constraint: never three items of
 * one kind in a row. That constraint is a presentation rule and selects
 * nothing (Rem. 4.9), so the draw holds no belief about the learner: in
 * particular, a word's pace factor is pacing and nothing more (Cor. 4.6
 * (iii)), and no word is drawn more often for having been reported stuck.
 *
 * Everything here is deterministic in its seed key, like the drama's option
 * order: a set can always be rebuilt from its key.
 */

import { seedOf, shuffledBySeed } from "@some-ui/core-utils"
import type {
  ReadAloudDeck,
  ReadAloudLevel,
} from "@topik/lib/topik/read-aloud/content"
import { syllablesOf } from "@topik/lib/topik/read-aloud/timing"

type WordItem = {
  kind: "word"
  /** Stable within a deck: `w:<wordId>:<surface>`. */
  key: string
  wordId: string
  /** The written form shown, exactly as its line writes it. */
  text: string
  /** The line the form is taken from, for its stem and pronunciation. */
  lineId: string
  syllables: number
}

type SentenceItem = {
  kind: "sentence"
  /** Stable within a deck: `s:<lineId>`. */
  key: string
  lineId: string
  text: string
  syllables: number
  /** Def. 4.8's `K_e`: every word the line is authored with. */
  wordIds: Array<string>
}

export type SetItem = WordItem | SentenceItem

export type SetOptions = {
  /** The learner's chosen level: lines above it are never drawn. */
  level: ReadAloudLevel
  /** Seeds every draw; a new key per set gives a new order. */
  seedKey: string
  words?: number
  sentences?: number
}

const DEFAULT_WORDS = 6
const DEFAULT_SENTENCES = 4

/** How many fresh orders are drawn before falling back to a spread one. */
const ORDER_ATTEMPTS = 32

/** Whether any three consecutive items share a kind. */
export function hasThreeAlike(items: ReadonlyArray<{ kind: string }>): boolean {
  return items.some(
    (item, index) =>
      index >= 2 &&
      items[index - 1]?.kind === item.kind &&
      items[index - 2]?.kind === item.kind
  )
}

/**
 * The fallback order: the kind with more left goes next unless that would
 * make three in a row. It avoids a triple whenever the counts allow one to
 * be avoided at all, and keeps each kind's own shuffled order.
 */
function spread(
  words: Array<SetItem>,
  sentences: Array<SetItem>
): Array<SetItem> {
  const queues = { word: [...words], sentence: [...sentences] }
  const order: Array<SetItem> = []
  while (queues.word.length + queues.sentence.length > 0) {
    const larger =
      queues.word.length >= queues.sentence.length ? "word" : "sentence"
    const other = larger === "word" ? "sentence" : "word"
    const last = order.at(-1)?.kind
    const runOfLarger = last === larger && order.at(-2)?.kind === larger
    const kind = runOfLarger && queues[other].length > 0 ? other : larger
    const next = queues[kind].shift()
    if (next) order.push(next)
  }
  return order
}

/**
 * Build one set from a deck.
 *
 * Sentences are drawn from lines at or below the level, the level's own
 * lines first. Words are drawn uniformly from the written forms in those
 * lines, one form per word, so a set never shows one word twice as a word
 * rep.
 */
export function buildSet(
  deck: ReadAloudDeck,
  {
    level,
    seedKey,
    words = DEFAULT_WORDS,
    sentences = DEFAULT_SENTENCES,
  }: SetOptions
): Array<SetItem> {
  const eligible = deck.lines.filter((line) => line.level <= level)
  const atLevel = eligible.filter((line) => line.level === level)
  const below = eligible.filter((line) => line.level < level)

  const sentenceItems: Array<SetItem> = [
    ...shuffledBySeed(atLevel, seedOf(`${seedKey}:sentences:at`)),
    ...shuffledBySeed(below, seedOf(`${seedKey}:sentences:below`)),
  ]
    .slice(0, Math.max(0, sentences))
    .map((line) => ({
      kind: "sentence",
      key: `s:${line.id}`,
      lineId: line.id,
      text: line.korean,
      syllables: syllablesOf(line.korean),
      wordIds: [...new Set(line.words.map((word) => word.wordId))],
    }))

  const forms = eligible.flatMap((line) =>
    line.words.map((occurrence) => ({ line, occurrence }))
  )
  const seen = new Set<string>()
  const wordItems: Array<SetItem> = []
  for (const { line, occurrence } of shuffledBySeed(
    forms,
    seedOf(`${seedKey}:words`)
  )) {
    if (wordItems.length >= words) break
    if (seen.has(occurrence.wordId)) continue
    seen.add(occurrence.wordId)
    wordItems.push({
      kind: "word",
      key: `w:${occurrence.wordId}:${occurrence.surface}`,
      wordId: occurrence.wordId,
      text: occurrence.surface,
      lineId: line.id,
      syllables: syllablesOf(occurrence.surface),
    })
  }

  const all = [...wordItems, ...sentenceItems]
  for (let attempt = 0; attempt < ORDER_ATTEMPTS; attempt += 1) {
    const order = shuffledBySeed(all, seedOf(`${seedKey}:order:${attempt}`))
    if (!hasThreeAlike(order)) return order
  }
  return spread(wordItems, sentenceItems)
}
