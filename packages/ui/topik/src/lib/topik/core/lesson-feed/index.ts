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

import { counted } from "@some-ui/core-utils"
import type { RoutineFile } from "@topik/lib/topik/adapter/routine-files"
import { openedKey } from "@topik/lib/topik/adapter/routine-files"
import { titleOf } from "@topik/lib/topik/core/drama"
import { GENRES } from "@topik/lib/topik/core/feed-card"
import type { AddedSet } from "@topik/lib/topik/read-aloud/added-sets"
import type {
  ParsedDeck,
  SetPractice,
} from "@topik/lib/topik/read-aloud/content"
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

/** What a set holds: a lens set's lines, any other set's words. */
export const setSize = (
  practice: SetPractice | undefined,
  words: number,
  lines: number
): string =>
  practice === "lens" ? counted(lines, "line") : counted(words, "word")

/** A genre named in English or Korean, as its key. */
const genreKeyOf = (part: string): string | undefined =>
  [...GENRES.map(({ genre }) => genre), "everyday"].find(
    (key) => key === part.toLowerCase() || setGenreKo(key) === part
  )

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
function sessionsOf(
  decks: ReadonlyArray<ParsedDeck>,
  added: ReadonlyArray<AddedSet>
): Array<LessonSession> {
  return decks.flatMap((parsed, at): Array<LessonSession> => {
    if (!parsed.ok) return []
    const { deck } = parsed
    const practice = deck.practice ?? (at === 0 ? "read-aloud" : "lens")
    return [
      {
        practice,
        id: deck.id,
        size: setSize(practice, deck.words.length, deck.lines.length),
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
  const decks = file.decks.map((raw) => parseReadAloudDeck(raw))
  const context = decks
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
    sessions: sessionsOf(decks, added),
  }
}

/**
 * Where an item stands on the list: not opened, then a scene with a set not
 * opened yet (its other button still waits), then the rest.
 */
const standing = (item: LessonItem): number =>
  !item.opened ? 0 : item.sessions.some((session) => !session.opened) ? 1 : 2

/**
 * The routine's files as the feed lists them: the ones not opened first,
 * then the scenes with a set still to open, each group in home's order.
 */
export function lessonItems(
  files: ReadonlyArray<RoutineFile>,
  opened: ReadonlySet<string>,
  added: ReadonlyArray<AddedSet>
): Array<LessonItem> {
  return files
    .map((file) => lessonItemOf(file, opened.has(openedKey(file)), added))
    .map((item, at) => ({ item, at }))
    .sort((a, b) => standing(a.item) - standing(b.item) || a.at - b.at)
    .map(({ item }) => item)
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
  found: (n: number): string => `${counted(n, "lesson")} found.`,
  none: (query: string): string =>
    `Nothing from the routine matches “${query.trim()}”.`,
} as const
