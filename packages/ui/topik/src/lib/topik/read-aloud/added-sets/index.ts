/**
 * Word sets added on the phone: decks an agent wrote for this learner,
 * picked from storage and kept beside the bundled deck, which is only the
 * floor (adaptive-learning canon Def. 1.3, Cor. 4.6 (iii), Rem. 7.5).
 *
 * A word is one concept wherever it is read, so an added set's words join
 * the one vocabulary by id: a word the phone already names keeps its pace.
 * A set that names an id the phone holds under another dictionary form is
 * claiming a different word with it, so that word, and every line written
 * with it, is dropped from the set rather than read under the wrong
 * meaning. Lines are the set's own: each is filed under the set's id, so two
 * sets that both call a line `cafe-1` never collide.
 *
 * Everything here is pure. The store keeps the list (`adapter/read-aloud-
 * store`), and the handheld lesson offers the newest unopened ones first.
 */

import { isRecord, jsonValues } from "@topik/lib/topik/generation/intake"
import type {
  ReadAloudDeck,
  ReadAloudLevel,
} from "@topik/lib/topik/read-aloud/content"
import { parseReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import { z } from "zod"

/** The bundled deck's id, which no added set may take. */
export const BUNDLED_DECK_ID = "bundled"

/** How many sets the phone keeps: far above a year of them, a few hundred KB. */
export const ADDED_SET_LIMIT = 50

export type AddedSet = {
  /** As parsed when it was added: the set's own ids, unfiled. */
  deck: ReadAloudDeck
  /** ISO. */
  addedAt: string
  /** ISO; null until the learner first opens it. */
  openedAt: string | null
}

export type SetIntake =
  | { ok: true; deck: ReadAloudDeck; dropped: number }
  | { ok: false; error: string }

/** Every line's level, the highest: what the set was written for. */
export const setLevel = (deck: ReadAloudDeck): ReadAloudLevel =>
  deck.lines.reduce<ReadAloudLevel>(
    (top, line) => (line.level > top ? line.level : top),
    1
  )

/** The set as the drill reads it: its lines filed under its id. */
const filed = (deck: ReadAloudDeck): ReadAloudDeck => ({
  ...deck,
  lines: deck.lines.map((line) => ({ ...line, id: `${deck.id}.${line.id}` })),
})

/**
 * `deck` without the words `known` names under another dictionary form, and
 * without the lines written with one of them.
 */
function withoutConflicts(
  deck: ReadAloudDeck,
  known: ReadonlyMap<string, string>
): ReadAloudDeck {
  const clashing = new Set(
    deck.words
      .filter((word) => {
        const lemma = known.get(word.id)
        return lemma !== undefined && lemma !== word.lemma
      })
      .map((word) => word.id)
  )
  if (clashing.size === 0) return deck
  return {
    ...deck,
    words: deck.words.filter((word) => !clashing.has(word.id)),
    lines: deck.lines.filter((line) =>
      line.words.every((occurrence) => !clashing.has(occurrence.wordId))
    ),
  }
}

export type ResolvedSets = {
  /** The bundled deck and every set, as one vocabulary: "Read aloud". */
  all: ReadAloudDeck
  /** Each set as the drill reads it on its own, by the set's id. */
  sets: ReadonlyMap<string, ReadAloudDeck>
}

/**
 * The bundled deck and the added sets, oldest first, as the drill reads
 * them. A set's words are judged against the bundled deck's and every
 * earlier set's.
 */
export function resolveSets(
  base: ReadAloudDeck,
  added: ReadonlyArray<AddedSet>
): ResolvedSets {
  const known = new Map(base.words.map((word) => [word.id, word.lemma]))
  const words = [...base.words]
  const lines = [...base.lines]
  const sets = new Map<string, ReadAloudDeck>()
  for (const { deck } of added) {
    const kept = filed(withoutConflicts(deck, known))
    for (const word of kept.words) {
      if (known.has(word.id)) continue
      known.set(word.id, word.lemma)
      words.push(word)
    }
    lines.push(...kept.lines)
    sets.set(deck.id, kept)
  }
  return { all: { ...base, words, lines }, sets }
}

const isDeck = (value: unknown): boolean =>
  isRecord(value) && "schemaVersion" in value && "lines" in value

/**
 * A picked file's text as a set the phone can add, judged against what it
 * already holds. Never throws. Lines the parse or a word clash drops are
 * counted, not refused: an error costs material, not the set.
 */
export function intakeSet(
  text: string,
  base: ReadAloudDeck,
  added: ReadonlyArray<AddedSet>
): SetIntake {
  const raw = jsonValues(text).find(isDeck)
  if (raw === undefined) {
    return { ok: false, error: "That file isn't a word set." }
  }
  const parsed = parseReadAloudDeck(raw)
  if (!parsed.ok) {
    return { ok: false, error: "That word set can't be read." }
  }
  const { deck } = parsed
  if (deck.id === BUNDLED_DECK_ID) {
    return { ok: false, error: "That word set's id is taken by the app's own." }
  }
  const replacing = added.some((set) => set.deck.id === deck.id)
  if (!replacing && added.length >= ADDED_SET_LIMIT) {
    return {
      ok: false,
      error: `This phone keeps ${ADDED_SET_LIMIT} word sets, and has ${added.length}.`,
    }
  }
  const others = added.filter((set) => set.deck.id !== deck.id)
  const kept = resolveSets(base, [
    ...others,
    { deck, addedAt: "", openedAt: null },
  ]).sets.get(deck.id)
  if (kept === undefined || kept.lines.length === 0) {
    return { ok: false, error: "No line in that word set can be read." }
  }
  const authored =
    isRecord(raw) && Array.isArray(raw.lines)
      ? raw.lines.length
      : deck.lines.length
  return { ok: true, deck, dropped: authored - kept.lines.length }
}

/**
 * `added` with `deck` in it, newest last. A set picked again under the same
 * id replaces the one kept and reads as new.
 */
export function addSet(
  added: ReadonlyArray<AddedSet>,
  deck: ReadAloudDeck,
  at: string
): Array<AddedSet> {
  return [
    ...added.filter((set) => set.deck.id !== deck.id),
    { deck, addedAt: at, openedAt: null },
  ]
}

/** `added` with the set `id` marked opened, the first time only. */
export function openSet(
  added: ReadonlyArray<AddedSet>,
  id: string,
  at: string
): Array<AddedSet> {
  return added.map((set) =>
    set.deck.id === id && set.openedAt === null ? { ...set, openedAt: at } : set
  )
}

/** The sets not opened yet, newest first: "Ready for you". */
export const readySets = (added: ReadonlyArray<AddedSet>): Array<AddedSet> =>
  added.filter((set) => set.openedAt === null).reverse()

const StoredSetSchema = z.object({
  deck: z.unknown(),
  addedAt: z.string(),
  openedAt: z.string().nullable(),
})

/** A set as the store writes it: its deck in the file format it came in. */
export const storedSet = (set: AddedSet): unknown => ({
  ...set,
  deck: { schemaVersion: 1, ...set.deck },
})

/**
 * The stored list (`storedSet`'s), each deck parsed again on the way out: a
 * set an older build wrote, or one that no longer parses, is dropped alone.
 */
export function parseAddedSets(raw: unknown): Array<AddedSet> {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    const stored = StoredSetSchema.safeParse(entry)
    if (!stored.success) return []
    const parsed = parseReadAloudDeck(stored.data.deck)
    if (!parsed.ok || parsed.deck.id === BUNDLED_DECK_ID) return []
    return [
      {
        deck: parsed.deck,
        addedAt: stored.data.addedAt,
        openedAt: stored.data.openedAt,
      },
    ]
  })
}
