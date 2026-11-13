/**
 * Every word the takes conveyor says (CONVEYOR1, #2873), in one pure table,
 * in the person's terms: where a take is, since when, and whether home has
 * heard of a move yet, never the machinery. The stations are the owner's
 * pizza names (ask #2876). `__tests__/words.test.ts` holds both.
 */
import { dayOf, formatDay } from "@some-ui/core-utils"

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
    canned: "Set aside. Home still keeps it.",
  } satisfies Record<TakeStation, string>,
  /** Where a take stands, said on its row. */
  standing: (standing: TakeStanding): string => {
    const name = STATIONS[standing.station]
    const where = standing.going
      ? `${name}. Home hears of it once it's in reach.`
      : standing.at === null
        ? name
        : `${name} since ${dayAt(standing.at)}`
    const { missed } = standing
    if (missed === null) return where
    const to = STATIONS[missed.to]
    const said = where.endsWith(".") ? where : `${where}.`
    return missed.why === "stale"
      ? `${said} Your move to ${to} wasn't made: it had already moved on.`
      : `${said} Home didn't take your move to ${to}.`
  },
  /** Why a move wasn't made. */
  refused: {
    here: "It's there already.",
    pickup: "Only the pickup moves a take to Picked up.",
    final: "A take that's been picked up stays there.",
    oven: "Nothing goes back in the oven. Move it to Cooking instead.",
    labels: `A take carries at most ${String(LABELS_MAX)} labels of ${String(LABEL_CHARS)} characters each.`,
    comment: `A note holds at most ${String(COMMENT_CHARS)} characters.`,
  } satisfies Record<MoveRefused, string>,
  /** A move this phone couldn't keep, so it wasn't made. */
  unkept: "This phone couldn't keep that move, so the take stays where it was.",
} as const
