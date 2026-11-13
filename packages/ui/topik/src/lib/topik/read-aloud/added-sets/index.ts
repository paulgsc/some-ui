/**
 * Word sets added on the phone: every word read-aloud reads comes from one,
 * a deck picked from storage and kept on the device. Nothing is compiled in;
 * the sets this repo keeps (`packages/some-content/prompts/read-aloud-
 * generator/sets`) reach the phone the same way an agent's do
 * (adaptive-learning canon Def. 1.3, Cor. 4.6 (iii), Rem. 7.5).
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
 *
 * A set the owner archives (MY-DATA MD7, #2496; call C232: only the owner
 * archives, from My data, never a rule) leaves Read aloud, the lens, "Ready
 * for you" and the count against `ADDED_SET_LIMIT`, and is kept whole: its
 * deck still resolves under its id and its words stay in the vocabulary, so
 * every tally, lens and progress row on it still reads and every word keeps
 * its pace. Bringing it back undoes exactly that. Nothing here deletes a set.
 */

import { isRecord, jsonValues, type Salvaged } from "@some-ui/core-utils"
import type {
  ReadAloudDeck,
  ReadAloudLevel,
} from "@topik/lib/topik/read-aloud/content"
import { parseReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import { z } from "zod"

/** "Read aloud": every set as one deck. Not kebab-case, so no set's id. */
export const ALL_SETS_ID = ":all"

/**
 * How many sets the phone keeps in use: far above a year of them, a few
 * hundred KB. An archived set does not count against it.
 */
export const ADDED_SET_LIMIT = 50

/** How long after its first open a set is said to be not opened in a while. */
export const NOT_OPENED_IN_A_WHILE_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export type AddedSet = {
  /** As parsed when it was added: the set's own ids, unfiled. */
  deck: ReadAloudDeck
  /** ISO. */
  addedAt: string
  /** ISO; null until the learner first opens it. */
  openedAt: string | null
  /** ISO; when the owner archived it, null while it is in use. */
  archivedAt: string | null
}

/** Whether the set is in use: not archived. */
export const inUse = (set: AddedSet): boolean => set.archivedAt === null

/** The sets in use, in their order: what counts against `ADDED_SET_LIMIT`. */
export const setsInUse = (added: ReadonlyArray<AddedSet>): Array<AddedSet> =>
  added.filter(inUse)

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
  /**
   * Every set as one vocabulary, read aloud: "Read aloud". Its words are
   * every set's, an archived set's too, so each keeps its pace; its lines
   * are every set's in use but a lens set's, which are there to be asked
   * about.
   */
  all: ReadAloudDeck
  /** Every line with a lens, from sets in use, lens sets and sets serving both. */
  lens: ReadAloudDeck
  /** Each set as the drill reads it on its own, by the set's id, archived ones too. */
  sets: ReadonlyMap<string, ReadAloudDeck>
}

/**
 * The added sets, oldest first, as the drill reads them. A set's words are
 * judged against every earlier set's.
 */
export function resolveSets(added: ReadonlyArray<AddedSet>): ResolvedSets {
  const known = new Map<string, string>()
  const words: ReadAloudDeck["words"] = []
  const lines: ReadAloudDeck["lines"] = []
  const lensLines: ReadAloudDeck["lines"] = []
  const sets = new Map<string, ReadAloudDeck>()
  for (const set of added) {
    const { deck } = set
    const kept = filed(withoutConflicts(deck, known))
    for (const word of kept.words) {
      if (known.has(word.id)) continue
      known.set(word.id, word.lemma)
      words.push(word)
    }
    if (inUse(set)) {
      if (kept.practice !== "lens") lines.push(...kept.lines)
      lensLines.push(...kept.lines.filter((line) => line.lens !== undefined))
    }
    sets.set(deck.id, kept)
  }
  const all = { id: ALL_SETS_ID, title: "Every word set", words, lines }
  return { all, lens: { ...all, lines: lensLines }, sets }
}

/**
 * The words `before` names and `after` does not, or names under another
 * dictionary form: a set picked again that dropped them, or that put its id
 * on a different word. Their paces go with them (Rem. 7.5); nothing else
 * prunes the pace book, so a word no set names yet keeps its pace until one
 * does.
 */
export function wordsLeaving(
  before: ReadonlyArray<AddedSet>,
  after: ReadonlyArray<AddedSet>
): Set<string> {
  const kept = new Map(
    resolveSets(after).all.words.map((word) => [word.id, word.lemma])
  )
  return new Set(
    resolveSets(before)
      .all.words.filter((word) => kept.get(word.id) !== word.lemma)
      .map((word) => word.id)
  )
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
  // Picked again, an archived set comes back in use, so it counts as new.
  const inUseNow = setsInUse(added)
  const replacing = inUseNow.some((set) => set.deck.id === deck.id)
  if (!replacing && inUseNow.length >= ADDED_SET_LIMIT) {
    return {
      ok: false,
      error: `This phone keeps ${ADDED_SET_LIMIT} word sets in use, and has ${inUseNow.length}. Archive one in My data to make room.`,
    }
  }
  const after = resolveSets(addSet(added, deck, "")).sets
  const kept = after.get(deck.id)
  if (kept === undefined || kept.lines.length === 0) {
    return { ok: false, error: "No line in that word set can be read." }
  }
  // A set picked again can drop a word another set's lines were judged by.
  const emptied = added.find(
    (set) =>
      set.deck.id !== deck.id && after.get(set.deck.id)?.lines.length === 0
  )
  if (emptied !== undefined) {
    return {
      ok: false,
      error: `That word set would leave "${emptied.deck.title}" with nothing to read.`,
    }
  }
  const authored =
    isRecord(raw) && Array.isArray(raw.lines)
      ? raw.lines.length
      : deck.lines.length
  return { ok: true, deck, dropped: authored - kept.lines.length }
}

/**
 * `added` with `deck` in it. A new set goes last; a set picked again under
 * the same id replaces the one kept in its place, so which set's word wins a
 * clash does not move, and reads as new: unopened, and in use if it was
 * archived.
 */
export function addSet(
  added: ReadonlyArray<AddedSet>,
  deck: ReadAloudDeck,
  at: string
): Array<AddedSet> {
  const fresh: AddedSet = {
    deck,
    addedAt: at,
    openedAt: null,
    archivedAt: null,
  }
  return added.some((set) => set.deck.id === deck.id)
    ? added.map((set) => (set.deck.id === deck.id ? fresh : set))
    : [...added, fresh]
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

/**
 * `added` with the set `id` archived at `at`: the owner's own act (C232).
 * A set already archived keeps the day it was archived.
 */
export function archiveSet(
  added: ReadonlyArray<AddedSet>,
  id: string,
  at: string
): Array<AddedSet> {
  return added.map((set) =>
    set.deck.id === id && set.archivedAt === null
      ? { ...set, archivedAt: at }
      : set
  )
}

/**
 * `added` with the archived set `id` back in use, or `added` as it was
 * when that would put more than `ADDED_SET_LIMIT` in use.
 */
export function bringBack(
  added: ReadonlyArray<AddedSet>,
  id: string
): Array<AddedSet> {
  const archived = added.some(
    (set) => set.deck.id === id && set.archivedAt !== null
  )
  if (!archived || setsInUse(added).length >= ADDED_SET_LIMIT) {
    return [...added]
  }
  return added.map((set) =>
    set.deck.id === id ? { ...set, archivedAt: null } : set
  )
}

/** Whether there is room to bring an archived set back. */
export const roomToBringBack = (added: ReadonlyArray<AddedSet>): boolean =>
  setsInUse(added).length < ADDED_SET_LIMIT

/**
 * Whether the set was first opened `NOT_OPENED_IN_A_WHILE_DAYS` or more days
 * before `now`: a hint on My data, never a rule (C232). The phone keeps a
 * set's first open only, so this says nothing of how lately it was read.
 */
export const notOpenedInAWhile = (set: AddedSet, now: Date): boolean =>
  set.openedAt !== null &&
  now.getTime() - Date.parse(set.openedAt) >=
    NOT_OPENED_IN_A_WHILE_DAYS * DAY_MS

/** One set as My data lists it (MD7). */
export type WordSetRow = {
  readonly id: string
  readonly title: string
  /** ISO. */
  readonly addedAt: string
  /** ISO; null until first opened. */
  readonly openedAt: string | null
  /** ISO; null while in use. */
  readonly archivedAt: string | null
  /** The lines it reads, as the drill reads them. */
  readonly lines: number
  /** `notOpenedInAWhile`: a hint only. */
  readonly openedLongAgo: boolean
}

/** Every set the phone keeps, as My data lists them (MD7). */
export type WordSetsList = {
  /** In use, most recently added first. */
  readonly inUse: ReadonlyArray<WordSetRow>
  /** Archived, most recently archived first. */
  readonly archived: ReadonlyArray<WordSetRow>
  /** `ADDED_SET_LIMIT`. */
  readonly limit: number
  /** Whether an archived set can be brought back now. */
  readonly room: boolean
}

/** `added` as My data lists it, judged at `now`. */
export function wordSetsList(
  added: ReadonlyArray<AddedSet>,
  now: Date
): WordSetsList {
  const { sets } = resolveSets(added)
  const rows = added.map(
    (set): WordSetRow => ({
      id: set.deck.id,
      title: set.deck.title,
      addedAt: set.addedAt,
      openedAt: set.openedAt,
      archivedAt: set.archivedAt,
      lines: sets.get(set.deck.id)?.lines.length ?? 0,
      openedLongAgo: notOpenedInAWhile(set, now),
    })
  )
  return {
    inUse: rows
      .filter((row) => row.archivedAt === null)
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    archived: rows
      .filter((row) => row.archivedAt !== null)
      .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")),
    limit: ADDED_SET_LIMIT,
    room: roomToBringBack(added),
  }
}

/**
 * The sets in use not opened yet, most recently added first: "Ready for
 * you".
 */
export const readySets = (added: ReadonlyArray<AddedSet>): Array<AddedSet> =>
  added
    .filter((set) => set.openedAt === null && inUse(set))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))

const StoredSetSchema = z.object({
  deck: z.unknown(),
  addedAt: z.string(),
  openedAt: z.string().nullable(),
  /** Absent in what builds before archiving wrote: in use. */
  archivedAt: z.string().nullable().optional(),
})

/** A set as the store writes it: its deck in the file format it came in. */
export const storedSet = (set: AddedSet): unknown => ({
  ...set,
  deck: { schemaVersion: 1, ...set.deck },
})

/**
 * A set as home's Korean record keeps it: `storedSet` without whether it is
 * archived, which stays on this phone (MD7; home keeps every set either way).
 */
export const homeSet = ({
  archivedAt: _archived,
  ...set
}: AddedSet): unknown => ({ ...set, deck: { schemaVersion: 1, ...set.deck } })

/**
 * The stored list (`storedSet`'s), each deck parsed again on the way out: a
 * set an older build wrote, or one that no longer parses, is left out alone
 * (`whole` false, so the store copies the list aside before writing over
 * it); null for a value that is not a list.
 */
export function readAddedSets(raw: unknown): Salvaged<Array<AddedSet>> | null {
  if (!Array.isArray(raw)) return null
  const sets = raw.flatMap((entry): Array<AddedSet> => {
    const stored = StoredSetSchema.safeParse(entry)
    if (!stored.success) return []
    const parsed = parseReadAloudDeck(stored.data.deck)
    if (!parsed.ok) return []
    return [
      {
        deck: parsed.deck,
        addedAt: stored.data.addedAt,
        openedAt: stored.data.openedAt,
        archivedAt: stored.data.archivedAt ?? null,
      },
    ]
  })
  return { value: sets, whole: sets.length === raw.length }
}
