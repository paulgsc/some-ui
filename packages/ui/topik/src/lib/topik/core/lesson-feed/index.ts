/**
 * What the reflections routine left, as the phone's feed shows it
 * (`components/topik/handheld/feed-tile`): each scene or drama an item with
 * its level, genre and premise, and the sessions it offers. A scene's two
 * sets are two sessions, its read-aloud set and its grammar lens set, each
 * started from its own button. A drama plays.
 *
 * The list shows the first few, the ones not opened first; the rest are a
 * search away (`searchLessons`), by level, genre, title or premise. Pure and
 * total.
 */

import type { RoutineFile } from "@topik/lib/topik/adapter/routine-files"
import { openedKey } from "@topik/lib/topik/adapter/routine-files"
import { titleOf } from "@topik/lib/topik/core/drama"
import { GENRES } from "@topik/lib/topik/core/feed-card"
import type { AddedSet } from "@topik/lib/topik/read-aloud/added-sets"
import type { SetPractice } from "@topik/lib/topik/read-aloud/content"
import {
  parseReadAloudDeck,
  setGenreKo,
} from "@topik/lib/topik/read-aloud/content"

/** One set of a scene, as its button offers it. */
export type LessonSession = {
  practice: SetPractice
  /** The set's id: what opens once it is added. */
  id: string
  /** What it holds: a read-aloud set's words, a lens set's lines. */
  size: string
  /** The phone holds it and has opened it. */
  opened: boolean
}

export type LessonItem = {
  /** `openedKey`: what opens it. */
  key: string
  kind: "scene" | "drama"
  /** Its name, without the level and genre a scene's title leads with. */
  name: string
  level: number | undefined
  /** `comedy`, `everyday`: a key `setGenreKo` names. */
  genre: string | undefined
  premise: string | undefined
  /** Opened on this phone before. */
  opened: boolean
  /** A scene's sets, read-aloud first; none for a drama, which plays. */
  sessions: ReadonlyArray<LessonSession>
}

/** How many the list shows before a search. */
export const FEED_FIRST = 3

const LEVEL = /^TOPIK ([1-6])$/

const count = (n: number, one: string): string =>
  `${n} ${one}${n === 1 ? "" : "s"}`

/** A genre named in English or Korean, as its key. */
const genreKeyOf = (part: string): string | undefined => {
  const lower = part.toLowerCase()
  if (setGenreKo(lower) !== undefined) return lower
  if (part === "일상") return "everyday"
  return GENRES.find(({ ko }) => ko === part)?.genre
}

/** `TOPIK 2 · comedy · What is this test`, the scene folder's name, read. */
function partsOf(title: string): {
  level: number | undefined
  genre: string | undefined
  name: string
} {
  const parts = title
    .split(" · ")
    .map((part) => part.trim())
    .filter((part) => part !== "")
  const levelMatch = LEVEL.exec(parts[0] ?? "")
  const level = levelMatch ? Number(levelMatch[1]) : undefined
  if (level !== undefined) parts.shift()
  const genre = parts.length > 1 ? genreKeyOf(parts[0] ?? "") : undefined
  if (genre !== undefined) parts.shift()
  return { level, genre, name: parts.join(" · ") || title }
}

/**
 * A scene's sets as sessions. A set says its practice; one written before
 * sets did is named by its place, since a scene holds the read-aloud set
 * first and the lens set second. A set that can't be read offers nothing.
 */
export function sessionsOf(
  decks: ReadonlyArray<unknown>,
  added: ReadonlyArray<AddedSet>
): Array<LessonSession> {
  return decks.flatMap((raw, at): Array<LessonSession> => {
    const parsed = parseReadAloudDeck(raw)
    if (!parsed.ok) return []
    const { deck } = parsed
    const practice = deck.practice ?? (at === 0 ? "read-aloud" : "lens")
    return [
      {
        practice,
        id: deck.id,
        size:
          practice === "lens"
            ? count(deck.lines.length, "line")
            : count(deck.words.length, "word"),
        opened: added.some(
          (set) => set.deck.id === deck.id && set.openedAt !== null
        ),
      },
    ]
  })
}

/** A routine file as the feed shows it. */
export function lessonItemOf(
  file: RoutineFile,
  opened: boolean,
  added: ReadonlyArray<AddedSet>
): LessonItem {
  if (file.kind === "drama") {
    return {
      key: openedKey(file),
      kind: "drama",
      name: titleOf(file.tree),
      level: file.tree.level,
      genre: undefined,
      premise: undefined,
      opened,
      sessions: [],
    }
  }
  const { level, genre, name } = partsOf(file.title)
  const context = file.decks
    .map((raw) => parseReadAloudDeck(raw))
    .flatMap((parsed) =>
      parsed.ok && parsed.deck.context ? [parsed.deck.context] : []
    )
    .at(0)
  return {
    key: openedKey(file),
    kind: "scene",
    name,
    level,
    genre: genre ?? context?.genre,
    premise: context?.premise,
    opened,
    sessions: sessionsOf(file.decks, added),
  }
}

/** The routine's files as the feed lists them: the ones not opened first. */
export function lessonItems(
  files: ReadonlyArray<RoutineFile>,
  opened: ReadonlySet<string>,
  added: ReadonlyArray<AddedSet>
): Array<LessonItem> {
  const items = files.map((file) =>
    lessonItemOf(file, opened.has(openedKey(file)), added)
  )
  return [
    ...items.filter((item) => !item.opened),
    ...items.filter((item) => item.opened),
  ]
}

/** Everything a search can find an item by, lower-cased. */
const searchTextOf = (item: LessonItem): string =>
  [
    item.name,
    item.level === undefined ? "" : `topik ${item.level}`,
    item.genre ?? "",
    item.genre === undefined ? "" : (setGenreKo(item.genre) ?? ""),
    item.premise ?? "",
    item.kind === "drama" ? "drama" : "word set",
    ...item.sessions.map(
      (session) => LESSON_FEED_WORDS.practice[session.practice]
    ),
  ]
    .join(" ")
    .toLowerCase()

/**
 * What the list shows for `query`: with none, the first `FEED_FIRST`; with
 * one, every item holding each of its words, in the list's order.
 */
export function searchLessons(
  items: ReadonlyArray<LessonItem>,
  query: string
): ReadonlyArray<LessonItem> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return items.slice(0, FEED_FIRST)
  return items.filter((item) => {
    const text = searchTextOf(item)
    return words.every((word) => text.includes(word))
  })
}

/**
 * The levels something on the list is at, lowest first, with how many are
 * at each: what the level filter offers. Nothing at a level, no choice of it.
 */
export function levelsHeld(
  levels: ReadonlyArray<number | undefined>
): Array<{ level: number; count: number }> {
  const counts = new Map<number, number>()
  for (const level of levels) {
    if (level !== undefined) counts.set(level, (counts.get(level) ?? 0) + 1)
  }
  return [...counts]
    .sort(([a], [b]) => a - b)
    .map(([level, count]) => ({ level, count }))
}

export const LESSON_FEED_WORDS = {
  heading: "From the routine",
  levels: "Show level",
  all: "All",
  search: "Search the routine's lessons",
  placeholder: "Level, genre or title",
  practice: {
    "read-aloud": "Read aloud",
    lens: "Grammar lens",
  } satisfies Record<SetPractice, string>,
  play: "Play it",
  opened: "Opened",
  /** Under the first few, while more wait. */
  more: (shown: number, total: number): string =>
    `${shown} of ${total} shown, the ones not opened first. Search for the rest.`,
  found: (n: number): string => `${count(n, "lesson")} found.`,
  none: (query: string): string =>
    `Nothing from the routine matches “${query.trim()}”.`,
} as const
