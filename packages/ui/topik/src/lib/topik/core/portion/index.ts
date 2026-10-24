/**
 * "What are you hungry for?": one thing to study, cut to the size the
 * learner asks for from what the phone already holds. Pure, and the one
 * place its words live, so they say what is served and how it stands
 * against what the phone has shown, never how it was chosen (`index.test.ts`).
 *
 * An order is a portion and a freshness. The portions are sizes, never
 * minutes:
 *
 * - a bite: one sentence of a word set, read aloud;
 * - a snack: `SNACK_LINES` sentences in a row from one set;
 * - a meal: one whole set, or a scene the routine left and not opened yet;
 * - dessert: a drama, nothing marked.
 *
 * Freshness reads read-aloud's own record of each sentence (`read-aloud/
 * tally`), and adds none: a sentence with no row was never shown; one last
 * shown `DUE_DAYS` or more days ago is due again; any other was seen. A
 * group of sentences is new when every one is, due when the latest shown
 * of them is due, and seen otherwise. A drama is new while the routine's is
 * not opened, and seen after.
 *
 * "Another one like this" passes the dishes already served for the order:
 * a bite or a snack goes on to the next lines of the same set that still
 * fit, then to the rest; when every one has been served, it starts over.
 */

import { assertNever, fnv1a } from "@some-ui/core-utils"
import type { RoutineFile } from "@topik/lib/topik/adapter/routine-files"
import { openedKey } from "@topik/lib/topik/adapter/routine-files"
import { titleOf } from "@topik/lib/topik/core/drama"
import type { AddedSet } from "@topik/lib/topik/read-aloud/added-sets"
import { intakeSet } from "@topik/lib/topik/read-aloud/added-sets"
import type {
  ReadAloudDeck,
  SetPractice,
} from "@topik/lib/topik/read-aloud/content"
import type { Tally } from "@topik/lib/topik/read-aloud/tally"
import { rowOf, tallyKey } from "@topik/lib/topik/read-aloud/tally"

export const PORTIONS = ["bite", "snack", "meal", "dessert"] as const
export type Portion = (typeof PORTIONS)[number]

export const FRESHNESS = ["new", "seen", "either"] as const
export type Freshness = (typeof FRESHNESS)[number]

export type Order = { portion: Portion; freshness: Freshness }

/** Sentences in a snack: about a third of a routine scene's read-aloud set. */
export const SNACK_LINES = 4

/** Days after its last showing that a sentence is due again. */
export const DUE_DAYS = 7

/** How a dish stands against what the phone has shown. */
export type Fresh =
  | { kind: "new" }
  | { kind: "seen"; lastShown?: string }
  | { kind: "due"; lastShown: string }

/** A sentence as the drill reads it: its line's id filed under its set. */
export type HeldLine = { id: string; korean: string; english: string }

/** A word set the phone holds, as the drill reads it on its own. */
export type HeldSet = {
  id: string
  title: string
  practice?: SetPractice
  lines: ReadonlyArray<HeldLine>
  /** ISO. */
  addedAt: string
}

/** A scene the routine left: its two sets, added when it is opened. */
type HeldScene = {
  key: string
  title: string
  opened: boolean
  /** The ids of the sets it adds. */
  setIds: ReadonlyArray<string>
}

/** Where a drama is played from. */
type DramaFrom = { from: "routine"; key: string } | { from: "pasted" }

type HeldDrama = {
  start: DramaFrom
  title: string
  /** Opened or played on this phone before. */
  seen: boolean
}

/** Everything a portion can be cut from. */
export type Holdings = {
  sets: ReadonlyArray<HeldSet>
  scenes: ReadonlyArray<HeldScene>
  dramas: ReadonlyArray<HeldDrama>
}

export type Dish =
  | {
      portion: "bite" | "snack"
      key: string
      setId: string
      setTitle: string
      /** Where the first line sits in its set. */
      at: number
      lines: ReadonlyArray<HeldLine>
      fresh: Fresh
    }
  | {
      portion: "meal"
      key: string
      start: { from: "routine"; key: string } | { from: "set"; id: string }
      title: string
      /** Its sentences; null for a routine scene, whose sets aren't held yet. */
      lines: number | null
      fresh: Fresh
    }
  | {
      portion: "dessert"
      key: string
      start: DramaFrom
      title: string
      fresh: Fresh
    }

// FRESHNESS

const DAY_MS = 24 * 60 * 60 * 1000

const midnight = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** Local days from `iso` to `now`; none for an instant after it. */
function daysSince(iso: string, now: Date): number {
  return Math.max(
    0,
    Math.round((midnight(now) - midnight(new Date(iso))) / DAY_MS)
  )
}

/** How a group of sentences stands: see the module comment. */
function freshOf(
  lines: ReadonlyArray<HeldLine>,
  tally: Tally,
  now: Date
): Fresh {
  const lasts = lines.flatMap((line) => {
    const row = rowOf(tally, tallyKey({ lineId: line.id, text: line.korean }))
    return row ? [row.last] : []
  })
  if (lasts.length === 0) return { kind: "new" }
  const lastShown = lasts.reduce((a, b) =>
    Date.parse(a) >= Date.parse(b) ? a : b
  )
  return daysSince(lastShown, now) >= DUE_DAYS
    ? { kind: "due", lastShown }
    : { kind: "seen", lastShown }
}

const fits = (freshness: Freshness, fresh: Fresh): boolean =>
  freshness === "either" ||
  (freshness === "new" ? fresh.kind === "new" : fresh.kind !== "new")

/** Due first, then new, then seen; within one, the longest ago first. */
const RANK: Record<Fresh["kind"], number> = { due: 0, new: 1, seen: 2 }

const shownAt = (fresh: Fresh): number =>
  fresh.kind === "new" || fresh.lastShown === undefined
    ? 0
    : Date.parse(fresh.lastShown)

/** A stable sort: what ties keeps the order it was listed in. */
const ranked = <T extends { fresh: Fresh }>(
  dishes: ReadonlyArray<T>
): Array<T> =>
  dishes
    .map((dish, place) => ({ dish, place }))
    .sort(
      (a, b) =>
        RANK[a.dish.fresh.kind] - RANK[b.dish.fresh.kind] ||
        shownAt(a.dish.fresh) - shownAt(b.dish.fresh) ||
        a.place - b.place
    )
    .map(({ dish }) => dish)

// WHAT EACH PORTION IS CUT FROM

/** Sets a sentence can be read aloud from, the most recently added first. */
const readable = (held: Holdings): Array<HeldSet> =>
  held.sets
    .filter((set) => set.practice !== "lens" && set.lines.length > 0)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))

function linesOf(
  held: Holdings,
  tally: Tally,
  now: Date,
  size: number
): Array<Dish> {
  return readable(held).flatMap((set) => {
    const cuts: Array<Dish> = []
    for (let at = 0; at < set.lines.length; at += size) {
      const lines = set.lines.slice(at, at + size)
      const first = lines[0]
      if (first === undefined) continue
      cuts.push({
        portion: size === 1 ? "bite" : "snack",
        key: size === 1 ? `bite:${first.id}` : `snack:${set.id}:${at}`,
        setId: set.id,
        setTitle: set.title,
        at,
        lines,
        fresh: freshOf(lines, tally, now),
      })
    }
    return cuts
  })
}

function mealsOf(held: Holdings, tally: Tally, now: Date): Array<Dish> {
  const waiting = held.scenes.filter((scene) => !scene.opened)
  const inScene = new Set(waiting.flatMap((scene) => scene.setIds))
  return [
    ...waiting.map(
      (scene): Dish => ({
        portion: "meal",
        key: `meal:routine:${scene.key}`,
        start: { from: "routine", key: scene.key },
        title: scene.title,
        lines: null,
        fresh: { kind: "new" },
      })
    ),
    ...readable(held)
      .filter((set) => !inScene.has(set.id))
      .map(
        (set): Dish => ({
          portion: "meal",
          key: `meal:set:${set.id}`,
          start: { from: "set", id: set.id },
          title: set.title,
          lines: set.lines.length,
          fresh: freshOf(set.lines, tally, now),
        })
      ),
  ]
}

const dessertsOf = (held: Holdings): Array<Dish> =>
  held.dramas.map((drama) => ({
    portion: "dessert",
    key:
      drama.start.from === "routine"
        ? `dessert:routine:${drama.start.key}`
        : "dessert:pasted",
    start: drama.start,
    title: drama.title,
    fresh: drama.seen ? { kind: "seen" } : { kind: "new" },
  }))

/** Every dish of `portion`, whatever its freshness, in the order offered. */
function menuOf(
  portion: Portion,
  held: Holdings,
  tally: Tally,
  now: Date
): Array<Dish> {
  switch (portion) {
    case "bite": {
      return linesOf(held, tally, now, 1)
    }
    case "snack": {
      return linesOf(held, tally, now, SNACK_LINES)
    }
    case "meal": {
      return mealsOf(held, tally, now)
    }
    case "dessert": {
      return dessertsOf(held)
    }
    default: {
      return assertNever(portion)
    }
  }
}

// SERVING

type LinesDish = Extract<Dish, { portion: "bite" | "snack" }>

/** A bite or a snack: lines read aloud from one set. */
export const isLines = (dish: Dish): dish is LinesDish =>
  dish.portion === "bite" || dish.portion === "snack"

/**
 * One dish for `order`, or null when nothing the phone holds fits it.
 * `served` is the keys already served for this order, oldest first: the
 * last is the dish "another one like this" was asked from.
 */
export function serve({
  order,
  held,
  tally,
  now,
  served = [],
}: {
  order: Order
  held: Holdings
  tally: Tally
  now: Date
  served?: ReadonlyArray<string>
}): Dish | null {
  const offered = ranked(
    menuOf(order.portion, held, tally, now).filter((dish) =>
      fits(order.freshness, dish.fresh)
    )
  )
  const last = served.at(-1)
  const anchor = offered.find((dish) => dish.key === last)
  // The next lines of the same set come first, in the set's own order.
  const following =
    anchor && isLines(anchor)
      ? offered
          .filter(isLines)
          .filter((dish) => dish.setId === anchor.setId && dish.at > anchor.at)
          .sort((a, b) => a.at - b.at)
      : []
  const passed = new Set(served)
  return (
    [...following, ...offered].find((dish) => !passed.has(dish.key)) ??
    // All served: start over, past the one on screen if there is another.
    offered.find((dish) => dish.key !== last) ??
    offered.at(0) ??
    null
  )
}

/**
 * What was served for the order once `dish` is: a dish served before in this
 * round starts the next round, so each one fitting comes round again.
 */
export const servedAfter = (
  served: ReadonlyArray<string>,
  dish: Dish
): ReadonlyArray<string> =>
  served.includes(dish.key) ? [dish.key] : [...served, dish.key]

/**
 * The order the question screen opens on: the last one asked for, leaning
 * fresh while the phone holds something not opened yet.
 */
export function openingOrder(last: Order | null, somethingNew: boolean): Order {
  return {
    portion: last?.portion ?? "bite",
    freshness: somethingNew ? "new" : (last?.freshness ?? "either"),
  }
}

/**
 * Whether the phone holds something new: a scene or a drama from the routine
 * not opened yet, or a sentence never shown.
 */
export const holdsNew = (held: Holdings, tally: Tally): boolean =>
  held.scenes.some((scene) => !scene.opened) ||
  held.dramas.some((drama) => !drama.seen) ||
  readable(held).some((set) =>
    set.lines.some(
      (line) =>
        rowOf(tally, tallyKey({ lineId: line.id, text: line.korean })) === null
    )
  )

// FROM WHAT THE PHONE HOLDS

/**
 * The holdings, from the sets added (and each as the drill reads it), the
 * routine's files and which are opened, and the drama this tab holds. With
 * no voice to read aloud, nothing that is read aloud is offered.
 */
export function holdingsOf({
  added,
  sets,
  routine,
  opened,
  pasted,
  canRead,
}: {
  added: ReadonlyArray<AddedSet>
  sets: ReadonlyMap<string, ReadAloudDeck>
  routine: ReadonlyArray<RoutineFile>
  opened: ReadonlySet<string>
  /** The drama pasted or picked this session, by title. */
  pasted: string | null
  canRead: boolean
}): Holdings {
  const held = canRead
    ? added.flatMap((set): Array<HeldSet> => {
        const own = sets.get(set.deck.id)
        return own
          ? [
              {
                id: own.id,
                title: own.title,
                ...(own.practice === undefined
                  ? {}
                  : { practice: own.practice }),
                lines: own.lines.map(({ id, korean, english }) => ({
                  id,
                  korean,
                  english,
                })),
                addedAt: set.addedAt,
              },
            ]
          : []
      })
    : []
  const scenes = canRead
    ? routine.flatMap(
        (file): Array<HeldScene> =>
          file.kind === "scene"
            ? [
                {
                  key: openedKey(file),
                  title: file.title,
                  opened: opened.has(openedKey(file)),
                  setIds: file.decks.flatMap((deck) => {
                    const intake = intakeSet(JSON.stringify(deck), added)
                    return intake.ok ? [intake.deck.id] : []
                  }),
                },
              ]
            : []
      )
    : []
  const dramas = [
    ...routine.flatMap(
      (file): Array<HeldDrama> =>
        file.kind === "drama"
          ? [
              {
                start: { from: "routine", key: openedKey(file) },
                title: titleOf(file.tree),
                seen: opened.has(openedKey(file)),
              },
            ]
          : []
    ),
    ...(pasted === null
      ? []
      : [{ start: { from: "pasted" } as const, title: pasted, seen: true }]),
  ]
  return { sets: held, scenes, dramas }
}

/**
 * The deck a bite or a snack is read from: its set with only its lines, under
 * an id of its own, so an unfinished set of the whole is not resumed in it.
 * The lines keep their ids, so read-aloud's record of each is the same row.
 */
export function portionDeck(
  deck: ReadAloudDeck,
  lineIds: ReadonlyArray<string>
): ReadAloudDeck {
  const ids = new Set(lineIds)
  return {
    ...deck,
    id: `${deck.id}~${fnv1a(lineIds.join(" ")).toString(36)}`,
    lines: deck.lines.filter((line) => ids.has(line.id)),
  }
}

// WORDS

const ago = (iso: string, now: Date): string => {
  const days = daysSince(iso, now)
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`
}

/** One set's title, quoted. */
const from = (title: string): string => `from “${title}”`

export const PORTION_WORDS = {
  title: "What are you hungry for?",
  lead: "Pick a portion. I'll serve one thing that size.",
  portionGroup: "Portion",
  freshnessHeading: "Fresh or familiar",
  serve: "Serve it",
  start: "Start",
  another: "Another one like this",
  change: "Change my order",
  /** The way in from the start screen, and what it offers. */
  entry: "What are you hungry for?",
  entryDetails: "A bite, a snack, a meal or dessert",
  portions: {
    bite: { ko: "한 입", en: "A bite", hint: "One sentence" },
    snack: {
      ko: "간식",
      en: "A snack",
      hint: `${SNACK_LINES} sentences of a set`,
    },
    meal: { ko: "한 끼", en: "A meal", hint: "A whole set or scene" },
    dessert: { ko: "디저트", en: "Dessert", hint: "A drama, nothing marked" },
  } satisfies Record<Portion, { ko: string; en: string; hint: string }>,
  freshness: {
    new: "New to me",
    seen: "Seen before",
    either: "Either",
  } satisfies Record<Freshness, string>,
  served: (order: Order): string =>
    `Served · ${PORTION_WORDS.portions[order.portion].en} · ${PORTION_WORDS.freshness[order.freshness]}`,
  /** Nothing the phone holds fits the order: what to try instead. */
  none: (order: Order): string =>
    order.freshness === "either"
      ? `Nothing on this phone makes ${PORTION_WORDS.portions[order.portion].en.toLowerCase()} yet.`
      : `Nothing on this phone makes ${PORTION_WORDS.portions[order.portion].en.toLowerCase()} that is ${order.freshness === "new" ? "new to you" : "seen before"}. Either may find one.`,
  /** How the dish stands, beside its mark. */
  fact: (dish: Dish, now: Date): string => {
    const { fresh } = dish
    if (fresh.kind === "due") {
      return `Due again · last shown ${ago(fresh.lastShown, now)}`
    }
    if (fresh.kind === "seen") {
      return fresh.lastShown === undefined
        ? "Seen before"
        : `Seen before · last shown ${ago(fresh.lastShown, now)}`
    }
    return "start" in dish && dish.start.from === "routine"
      ? "New · from the routine"
      : "New · never shown"
  },
  /** What the dish is, under its Korean. */
  what: (dish: Dish): string => {
    switch (dish.portion) {
      case "bite":
      case "snack": {
        const size =
          dish.lines.length === 1
            ? "One sentence"
            : `A run of ${dish.lines.length} sentences`
        return `${size} ${from(dish.setTitle)}, read aloud.`
      }
      case "meal": {
        return dish.lines === null
          ? "The routine's scene: it opens on its read-aloud set, and its grammar lens set waits under “Ready for you”."
          : `Every sentence ${from(dish.title)}, ${dish.lines} in all, read aloud.`
      }
      case "dessert": {
        return "A drama to step into. Nothing is marked."
      }
      default: {
        return assertNever(dish)
      }
    }
  },
} as const
