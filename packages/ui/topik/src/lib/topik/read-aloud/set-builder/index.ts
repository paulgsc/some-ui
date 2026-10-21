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
 * Which sentences a set holds follows the sitting's own history and nothing
 * else (Rem. 4.9): the ones not yet shown this sitting, then, once every one
 * has been shown, the one shown longest ago. The history is the list of line
 * ids the set machine keeps for the sitting, handed in as `shown`, oldest
 * first. A word is drawn from no line's words that a sentence of the same
 * set already holds.
 *
 * Everything here is deterministic in its seed key, like the drama's option
 * order: a set can always be rebuilt from its key.
 */

import { fnv1a, shuffledBySeed } from "@some-ui/core-utils"
import type {
  ReadAloudDeck,
  ReadAloudLevel,
  ReadAloudLine,
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
  /**
   * The line ids shown this sitting, the one shown longest ago first (the set
   * machine's `shown`). Absent at the start of a sitting.
   */
  shown?: ReadonlyArray<string>
}

/** How much of the sitting's sentences have been shown, for the pool bar. */
export type SentencePool = {
  /** Different sentences at or below the level shown this sitting. */
  shown: number
  /** Sentences at or below the level: every one a set can draw. */
  of: number
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
 * How many sentences the deck writes for the level itself, when that is
 * fewer than a set draws and lower levels fill the rest (`buildSet`); null
 * when the level's own lines fill a set, or nothing below could fill it.
 * The start screen says so (Cor. 4.6 (ii)): a set at a higher level that is
 * mostly lower-level lines otherwise reads exactly like a lower level.
 */
export function levelShortfall(
  deck: ReadAloudDeck,
  level: ReadAloudLevel,
  sentences = DEFAULT_SENTENCES
): number | null {
  const own = deck.lines.filter((line) => line.level === level).length
  const below = deck.lines.some((line) => line.level < level)
  return own < sentences && below ? own : null
}

/**
 * The sentences a sitting has drawn from, of those a set can draw at `level`
 * (lines at or below it). A line shown that the deck no longer holds, or
 * holds above the level, is not counted.
 */
export function sentencePool(
  deck: ReadAloudDeck,
  level: ReadAloudLevel,
  shown: ReadonlyArray<string>
): SentencePool {
  const eligible = deck.lines.filter((line) => line.level <= level)
  const ids = new Set(shown)
  return {
    shown: eligible.filter((line) => ids.has(line.id)).length,
    of: eligible.length,
  }
}

/** Def. 4.8's `K_e` for a line: every word it is written with, once each. */
const sentenceWordIds = (line: ReadAloudLine): Array<string> => [
  ...new Set(line.words.map((word) => word.wordId)),
]

/**
 * Build one set from a deck.
 *
 * Sentences are drawn from lines at or below the level: those not yet shown
 * this sitting first, the level's own lines before lower ones, each group in
 * a fresh uniform order; once none is left unshown, the one shown longest
 * ago. Words are drawn uniformly from the written forms in those lines, one
 * form per word, so a set never shows one word twice as a word rep, and
 * never one that a sentence of the set holds: that word is drilled in its
 * sentence.
 */
export function buildSet(
  deck: ReadAloudDeck,
  {
    level,
    seedKey,
    words = DEFAULT_WORDS,
    sentences = DEFAULT_SENTENCES,
    shown = [],
  }: SetOptions
): Array<SetItem> {
  const eligible = deck.lines.filter((line) => line.level <= level)
  const atLevel = eligible.filter((line) => line.level === level)
  const below = eligible.filter((line) => line.level < level)

  const shownIds = new Set(shown)
  const byId = new Map(eligible.map((line) => [line.id, line]))
  const longestAgo = [...new Set(shown)].flatMap((id) => byId.get(id) ?? [])

  const chosen = [
    ...shuffledBySeed(
      atLevel.filter((line) => !shownIds.has(line.id)),
      fnv1a(`${seedKey}:sentences:at`)
    ),
    ...shuffledBySeed(
      below.filter((line) => !shownIds.has(line.id)),
      fnv1a(`${seedKey}:sentences:below`)
    ),
    ...longestAgo,
  ].slice(0, Math.max(0, sentences))

  const sentenceItems: Array<SetItem> = chosen.map((line) => ({
    kind: "sentence",
    key: `s:${line.id}`,
    lineId: line.id,
    text: line.korean,
    syllables: syllablesOf(line.korean),
    wordIds: sentenceWordIds(line),
  }))

  const forms = eligible.flatMap((line) =>
    line.words.map((occurrence) => ({ line, occurrence }))
  )
  // The words the sentences hold are in the set already, as sentences.
  const seen = new Set<string>(chosen.flatMap(sentenceWordIds))
  const wordItems: Array<SetItem> = []
  for (const { line, occurrence } of shuffledBySeed(
    forms,
    fnv1a(`${seedKey}:words`)
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
    const order = shuffledBySeed(all, fnv1a(`${seedKey}:order:${attempt}`))
    if (!hasThreeAlike(order)) return order
  }
  return spread(wordItems, sentenceItems)
}

/**
 * Whether every item still reads as `deck` writes it at `level`. A set
 * drawn from an earlier copy of a deck (one picked again since, with lines
 * changed) is not resumed: its items would show what the deck no longer
 * says.
 */
export function drawnFrom(
  items: ReadonlyArray<SetItem>,
  deck: ReadAloudDeck,
  level: ReadAloudLevel
): boolean {
  const lines = new Map(deck.lines.map((line) => [line.id, line]))
  return items.every((item) => {
    const line = lines.get(item.lineId)
    if (line === undefined || line.level > level) return false
    if (item.kind === "word") {
      return line.words.some(
        (occurrence) =>
          occurrence.wordId === item.wordId && occurrence.surface === item.text
      )
    }
    const wordIds = sentenceWordIds(line)
    return (
      line.korean === item.text &&
      wordIds.length === item.wordIds.length &&
      wordIds.every((id, index) => item.wordIds[index] === id)
    )
  })
}
