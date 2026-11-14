/**
 * Every word the takes conveyor says (CONVEYOR1, #2873), in one pure table,
 * in the person's terms: where a take is, since when, and whether home has
 * heard of a move yet, never the machinery. The stations are the owner's
 * pizza names (ask #2876). `__tests__/words.test.ts` holds both.
 */
import { assertNever, dayOf, formatDay } from "@some-ui/core-utils"

import type { MoveRefused, TakeStanding, TakeStation } from "./model"
import { COMMENT_CHARS, LABEL_CHARS, LABELS_MAX } from "./model"

/** The day, on this phone's calendar. */
const dayAt = (iso: string): string => formatDay(dayOf(new Date(iso)))

const STATIONS = {
  "in-the-oven": "In the oven",
  cooking: "Cooking",
  "ready-for-pickup": "Ready for pickup",
  "picked-up": "Picked up",
  canned: "Canned",
} as const satisfies Record<TakeStation, string>

export const TAKE_CONVEYOR_WORDS = {
  /** What a take's station strip is of, for a reader that can't see it. */
  label: "Where this take is",
  stations: STATIONS,
  /** What each station means, said once beside it. */
  means: {
    "in-the-oven": "Just recorded. Nothing is asked of it yet.",
    cooking: "You're still working it out.",
    "ready-for-pickup": "The next pickup files it as an issue.",
    "picked-up": "Filed as an issue.",
    canned: "Put on the shelf. Home still keeps it.",
  } satisfies Record<TakeStation, string>,
  /** Where a take stands, said on its row. */
  standing: (standing: TakeStanding): string => {
    const name = STATIONS[standing.station]
    const where = standing.going
      ? `${name}. Home hasn't taken this move yet.`
      : standing.at === null
        ? name
        : `${name} since ${dayAt(standing.at)}`
    const { missed } = standing
    if (missed === null) return where
    const to = STATIONS[missed.to]
    const said = where.endsWith(".") ? where : `${where}.`
    switch (missed.why) {
      case "stale": {
        return `${said} Your move to ${to} wasn't made: it had already moved on.`
      }
      case "off": {
        return `${said} Your move to ${to} wasn't made: it's off the conveyor now.`
      }
      case "refused": {
        return `${said} Home didn't take your move to ${to}.`
      }
      default: {
        return assertNever(missed.why)
      }
    }
  },
  /** Why a move wasn't made. */
  refused: {
    here: "It's there already.",
    pickup: "Only the pickup moves a take to Picked up.",
    final: "A take that's been picked up stays there.",
    oven: "Nothing goes back in the oven. Move it to Cooking instead.",
    labels: `A take carries at most ${String(LABELS_MAX)} labels of at most ${String(LABEL_CHARS)} characters each, with no tabs or line breaks.`,
    comment: `A note holds at most ${String(COMMENT_CHARS)} characters, with no tabs or line breaks.`,
  } satisfies Record<MoveRefused, string>,
  /** A move this phone couldn't keep, so it wasn't made. */
  unkept: "This phone couldn't keep that move, so the take stays where it was.",
  /** The conveyor page (CONVEYOR2): the one place a take is moved. */
  page: {
    heading: "On the conveyor",
    intro:
      "Listen to each take and move it along. Only a take you move to Ready for pickup is filed as an issue, by the next pickup. Canned sets one aside and home keeps it; deleting one for good is in My data.",
    /** A take's move to `station`, said on its button. */
    moveTo: (station: TakeStation): string => `Move to ${STATIONS[station]}`,
    can: "Can it",
    labels: "Labels",
    labelsHint:
      "A word or two, with commas between. What you type replaces its labels; blank keeps them.",
    note: "A note",
    noteHint: "Do you like it? What's it for?",
    /**
     * Said once a move is made, with where it went, in the row's own words
     * for a move home hasn't taken (`standing`'s `going`).
     */
    moved: (station: TakeStation): string =>
      `Moved to ${STATIONS[station]}. Home hasn't taken this move yet.`,
  },
} as const
