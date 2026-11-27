/**
 * One home for every take (TAKES20, #3219; epic #3029): what home calls each
 * kind of voice note (`of`), which of Takes' compartments each goes in, and
 * one port per kind that says what a take of it is about, from what home was
 * told of it (`ref`, and a game bite's `fields`) and the names the build
 * knows (`TakeNames`). Pure; the words are `./words`'.
 *
 * - **Every kind home keeps has a compartment and an about port.** Both are
 *   `Record`s over `TAKE_OFS`, so a kind added there without one fails the
 *   typecheck.
 * - **A kind this phone doesn't know still shows** (`other`): in All, with
 *   its day, never dropped.
 * - **Studio's takes keep their own split** (`./compartments`' `aboutOfRef`):
 *   an episode note, a scene, an idea, an ask or one recorded on Takes.
 */
import { assertNever, dayOf, formatDay, weekNumber } from "@some-ui/core-utils"

import type { MatchMethod } from "./take-ofs"
import { MATCH_METHODS, TAKE_OFS } from "./take-ofs"

export { TAKE_OFS }

export type TakeOf = (typeof TAKE_OFS)[number]

/** The kinds a port names, each its own compartment: every kind but Studio's. */
export type OtherOf = Exclude<TakeOf, "studio">

/** A compartment for each kind but Studio's, by what home calls it. */
export const KIND_OF = {
  reflection: "reflection",
  jobs: "jobs",
  scene: "drama",
  game: "bite",
  soundbite: "soundbite",
  lens: "lens",
  leetype: "leetype",
  "rust-round": "round",
  interview: "interview",
  hunch: "hunch",
} as const satisfies Record<OtherOf, string>

/** A compartment named by a port, or `other` for a kind this phone doesn't know. */
export type PortKind = (typeof KIND_OF)[OtherOf] | "other"

/**
 * What a take is about, that takes of its kind share and can be filtered
 * and sorted by (a game, a week, a session file): `key` as home keys it
 * (`about.key`, `game:<id>`), `label` in the person's words. `asks` says
 * home filters by it (every port's); Studio's are the phone's alone.
 */
export type TakeTopic = {
  readonly key: string
  readonly label: string
  readonly asks?: boolean | undefined
}

const topicOf = (key: string, label: string): TakeTopic => ({
  key,
  label,
  asks: true,
})

/**
 * What a take of a port's kind is about: its topic, if it has one, and the
 * rest of its about line, each part already in the person's words.
 */
export type PortAbout = {
  readonly kind: PortKind
  readonly topic: TakeTopic | null
  readonly parts: ReadonlyArray<string>
}

/** What a build can name that a take's ref only points at. Each is null when it can't. */
export type TakeNames = {
  /** A game, by ESPN's id: "49ers vs Rams". */
  readonly game: (id: string) => string | null
  /** A game-day scenario, by its id: "Fourth down". */
  readonly scenario: (id: string) => string | null
  /** An interview week's question, by the week and the question's id. */
  readonly question: (week: string, question: string) => string | null
  /** Which unit a bite is about, and whose: "CHI defense" (#3049). */
  readonly unit?:
    | ((unit: string, side: string | null) => string | null)
    | undefined
  /** The half a bite was in: "2nd half". */
  readonly half?: ((half: string) => string | null) | undefined
}

export const NO_NAMES: TakeNames = {
  game: () => null,
  scenario: () => null,
  question: () => null,
}

/** What home was told of a take, as a port reads it. */
export type TakeTold = {
  readonly ref: string
  readonly fields?: Readonly<Record<string, string>> | undefined
}

/** The words a port says that aren't data: `./words`' `ABOUT_WORDS`. */
export type AboutPortWords = {
  readonly week: (n: number) => string
  readonly read: string
  readonly gameOn: (day: string) => string
  readonly aGame: string
  /** The play a bite was matched to: its quarter (5 and on are overtime) and clock. */
  readonly atPlay: (period: number, clock: string | undefined) => string
  /** A bite home looked for a play for and found none. */
  readonly noPlay: string
  readonly soundbiteFrom: (source: string) => string
}

/** One port: what a take of its kind is about. */
export type AboutPort = (
  told: TakeTold,
  names: TakeNames,
  words: AboutPortWords
) => PortAbout

/** A week's id as the weeks name it: `2026-w46`. */
const WEEK = /^\d{4}-w\d{1,2}$/

function weekTopic(
  of: "interview" | "rust-round",
  id: string | undefined,
  words: AboutPortWords
): TakeTopic | null {
  if (id === undefined || !WEEK.test(id)) return null
  return topicOf(`${of}:${id}`, words.week(weekNumber(id)))
}

const present = (
  parts: ReadonlyArray<string | null | undefined>
): Array<string> =>
  parts.flatMap((part) =>
    part === null || part === undefined || part.trim() === "" ? [] : [part]
  )

/** The day an ISO time falls on, on this phone's calendar; null if it isn't one. */
function dayAtOrNull(iso: string | undefined): string | null {
  if (iso === undefined) return null
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? null : formatDay(dayOf(at))
}

/** A ref's words: `-` and `_` read as spaces, as `refOf` wrote them. */
const spoken = (ref: string): string => ref.replace(/[-_]+/g, " ").trim()

/**
 * A bite's moment: the quarter and clock of the play home matched it to;
 * that no play was found, when home looked and found none; else the clock
 * the screen showed when it was said (a bite home hasn't matched yet, one
 * still on this phone, or one about a stretch of the game).
 */
function biteMoment(
  fields: Readonly<Record<string, string>>,
  words: AboutPortWords
): string | undefined {
  const said = fields.strip?.split(" · ")[0]
  // A method this phone doesn't know reads as not matched yet.
  const method: MatchMethod | undefined = MATCH_METHODS.find(
    (each) => each === fields.matchedBy
  )
  if (method === undefined) return said
  switch (method) {
    case "nearest":
    case "next": {
      const period = Number(fields.playPeriod)
      return Number.isInteger(period) && period > 0
        ? words.atPlay(period, fields.playClock)
        : said
    }
    case "unmatched": {
      return words.noPlay
    }
    case "not-a-play":
    case "no-scenario": {
      return said
    }
    default: {
      return assertNever(method)
    }
  }
}

/**
 * Each kind's port. A bite: its game (by name, else the day it started),
 * its half when no matched play says it, its moment (`biteMoment`), the
 * scenario it was said on, and the unit it is about (#3049). A
 * week's take: its week and what it answers. The rest: what their ref says.
 */
export const ABOUT_PORTS: Readonly<Record<OtherOf, AboutPort>> = {
  reflection: () => ({ kind: "reflection", topic: null, parts: [] }),
  jobs: ({ ref }) => {
    const [day, pick] = ref.split(":")
    const named = pick !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(day ?? "")
    return {
      kind: "jobs",
      topic:
        ref === "" ? null : topicOf(`jobs:${ref}`, spoken(named ? pick : ref)),
      parts: present([named ? day : null]),
    }
  },
  scene: () => ({ kind: "drama", topic: null, parts: [] }),
  game: ({ ref, fields = {} }, names, words) => {
    const day = dayAtOrNull(fields.started)
    // Home names the game it fetched (`label`); else the build; else its day.
    const label =
      fields.label ??
      names.game(ref) ??
      (day === null ? words.aGame : words.gameOn(day))
    const scenario =
      fields.scenario === undefined ? null : names.scenario(fields.scenario)
    const unit =
      fields.unit === undefined
        ? null
        : (names.unit?.(fields.unit, fields.unitSide ?? null) ?? null)
    // A matched play's quarter says its half already.
    const half =
      fields.half === undefined || fields.playPeriod !== undefined
        ? null
        : (names.half?.(fields.half) ?? null)
    return {
      kind: "bite",
      topic: ref === "" ? null : topicOf(`game:${ref}`, label),
      parts: present([half, biteMoment(fields, words), scenario, unit]),
    }
  },
  soundbite: ({ ref }, _names, words) => ({
    kind: "soundbite",
    topic: null,
    parts: [words.soundbiteFrom(ref)],
  }),
  lens: ({ ref }) => ({ kind: "lens", topic: null, parts: [spoken(ref)] }),
  leetype: ({ ref }) => {
    const [file, screen] = ref.split(":")
    return {
      kind: "leetype",
      topic:
        file === undefined || file === ""
          ? null
          : topicOf(`leetype:${file}`, spoken(file)),
      parts: present([screen === undefined ? null : spoken(screen)]),
    }
  },
  "rust-round": ({ ref }, _names, words) => {
    const [first, second] = ref.split(":")
    const week = weekTopic("rust-round", first, words)
    if (week !== null) {
      return { kind: "round", topic: week, parts: present([second]) }
    }
    return {
      kind: "round",
      topic:
        first === undefined || first === ""
          ? null
          : topicOf(`rust-round:${first}`, spoken(first)),
      parts: present([second === undefined ? null : spoken(second)]),
    }
  },
  interview: ({ ref }, names, words) => {
    const [week, second, third] = ref.split(":")
    const topic = weekTopic("interview", week, words)
    if (second === "read") {
      return {
        kind: "interview",
        topic,
        parts: present([
          words.read,
          third === undefined ? null : spoken(third),
        ]),
      }
    }
    const question =
      week === undefined || second === undefined
        ? null
        : (names.question(week, second) ?? spoken(second))
    return { kind: "interview", topic, parts: present([question]) }
  },
  // A hunch spoken in KPLAY's shop: its words are what home heard.
  hunch: () => ({ kind: "hunch", topic: null, parts: [] }),
}

/** What a take of a kind this phone doesn't know is about: nothing more than its kind. */
const OTHER_ABOUT: PortAbout = { kind: "other", topic: null, parts: [] }

/**
 * What a take is about, from what home was told of it: Studio's by its ref
 * (`studio`), every other kind through its port, and a kind this phone
 * doesn't know as `other`. A home before TAKES20 says no `of`: its takes are
 * all Studio's.
 */
export function portAbout(
  of: TakeOf | "unknown",
  told: TakeTold,
  names: TakeNames,
  words: AboutPortWords
): PortAbout | null {
  if (of === "studio") return null
  if (of === "unknown") return OTHER_ABOUT
  return ABOUT_PORTS[of](told, names, words)
}
