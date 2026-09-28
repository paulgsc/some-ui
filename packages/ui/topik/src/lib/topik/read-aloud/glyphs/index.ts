/**
 * What the read-aloud screen draws for an item, block by block
 * (adaptive-learning canon Cor. 4.6 (iv)).
 *
 * The glyphs follow the sound. An item is cut into cells: one per Hangul
 * syllable, and one per run of anything else (a space, punctuation), so the
 * screen can mark the block being read or heard - a syllable at a time for a
 * word, a word at a time for a sentence. While the audio and the echo run, a
 * syllable whose pronunciation differs from its spelling is shown as said;
 * at the gloss it is restored, and a word's syllables are divided into stem
 * and ending. Where a line lists no occurrence for a run, or its
 * pronunciation was dropped at load, the spelling is shown unchanged.
 *
 * Pure: the screen owns the timing, this owns only what each cell says.
 */

import type {
  ReadAloudDeck,
  ReadAloudLine,
  ReadAloudWord,
  WordOccurrence,
} from "@topik/lib/topik/read-aloud/content"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"

/** How the cells are drawn: as spelled, as said, or divided at the gloss. */
export type GlyphMode = "spelled" | "pronounced" | "divided"

export type GlyphCell =
  | {
      kind: "syllable"
      /** Stable within the item, for rendering. */
      key: string
      /** What the cell shows now. */
      text: string
      /** The spelling, when `text` shows how the syllable is said instead. */
      spelled?: string
      /** Which run of Hangul in the item: a sentence's word. */
      word: number
      /** Which syllable in the item, counting across words. */
      syllable: number
      /** At the gloss, a syllable past its word's stem. */
      ending: boolean
    }
  | { kind: "gap"; key: string; text: string }

const HANGUL_RUN = /[가-힣]+|[^가-힣]+/g
const HANGUL = /^[가-힣]/

/** By id, in a Map, so no id can reach a prototype. */
const byId = <T extends { id: string }>(items: Array<T>): Map<string, T> =>
  new Map(items.map((item) => [item.id, item]))

export function lineOf(
  deck: ReadAloudDeck,
  lineId: string
): ReadAloudLine | undefined {
  return deck.lines.find((line) => line.id === lineId)
}

/**
 * The occurrences an item's runs are written with, in order: the one form a
 * word item shows, or every word of a sentence's line.
 */
function occurrencesOf(
  item: SetItem,
  line: ReadAloudLine | undefined
): Array<WordOccurrence | undefined> {
  if (!line) return []
  if (item.kind === "sentence") return line.words
  return [
    line.words.find(
      (occurrence) =>
        occurrence.wordId === item.wordId && occurrence.surface === item.text
    ),
  ]
}

/** An item's cells, drawn in the given mode. */
export function glyphCells(
  deck: ReadAloudDeck,
  item: SetItem,
  mode: GlyphMode
): Array<GlyphCell> {
  const occurrences = occurrencesOf(item, lineOf(deck, item.lineId))
  const cells: Array<GlyphCell> = []
  let word = 0
  let syllable = 0
  for (const run of item.text.match(HANGUL_RUN) ?? []) {
    if (!HANGUL.test(run)) {
      cells.push({ kind: "gap", key: `g${syllable}`, text: run })
      continue
    }
    const occurrence =
      occurrences[word]?.surface === run ? occurrences[word] : undefined
    const said = occurrence?.pronunciation
    const saidAligned = said?.length === run.length
    Array.from(run).forEach((spelled, index) => {
      const shown =
        mode === "pronounced" && saidAligned
          ? (said[index] ?? spelled)
          : spelled
      cells.push({
        kind: "syllable",
        key: `s${syllable}`,
        text: shown,
        spelled: shown === spelled ? undefined : spelled,
        word,
        syllable,
        ending:
          mode === "divided" &&
          item.kind === "word" &&
          occurrence !== undefined &&
          index >= occurrence.stemEnd,
      })
      syllable += 1
    })
    word += 1
  }
  return cells
}

/** How many blocks the mark steps through: syllables of a word, words of a sentence. */
export function markUnits(item: SetItem): number {
  return item.kind === "word"
    ? item.syllables
    : (item.text.match(/[가-힣]+/g) ?? []).length
}

/** Whether a cell is the block the mark is on. */
export function isMarked(
  item: SetItem,
  cell: GlyphCell,
  mark: number | null
): boolean {
  if (mark === null || cell.kind === "gap") return false
  return item.kind === "word" ? cell.syllable === mark : cell.word === mark
}

export type GlossEntry = {
  wordId: string
  lemma: string
  /** What the word means here: the line's sense, else the dictionary gloss. */
  meaning: string
}

export type ItemGloss =
  | { kind: "word"; lemma: string; meaning: string; surface: string }
  | { kind: "sentence"; english: string; words: Array<GlossEntry> }

/**
 * What the gloss shows: a word's dictionary form and meaning, or a sentence's
 * English with the words it is written with - its vocabulary basket.
 */
export function glossOf(deck: ReadAloudDeck, item: SetItem): ItemGloss {
  const words = byId<ReadAloudWord>(deck.words)
  const line = lineOf(deck, item.lineId)
  if (item.kind === "word") {
    const word = words.get(item.wordId)
    const occurrence = occurrencesOf(item, line)[0]
    return {
      kind: "word",
      lemma: word?.lemma ?? item.text,
      meaning: occurrence?.sense ?? word?.gloss ?? "",
      surface: item.text,
    }
  }
  const seen = new Set<string>()
  const basket: Array<GlossEntry> = []
  for (const occurrence of line?.words ?? []) {
    const word = words.get(occurrence.wordId)
    if (!word || seen.has(word.id)) continue
    seen.add(word.id)
    basket.push({
      wordId: word.id,
      lemma: word.lemma,
      meaning: occurrence.sense ?? word.gloss,
    })
  }
  return { kind: "sentence", english: line?.english ?? "", words: basket }
}
