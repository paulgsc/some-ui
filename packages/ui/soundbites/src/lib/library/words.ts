/**
 * Every word Takes on home says (ST32), in one pure table, in the person's
 * terms: what home keeps and what it heard, and which search ran, never the
 * machinery. "Take" is the one word for a recording here (ST34).
 * `__tests__/words.test.ts` holds both.
 */
import { counted, dayOf, formatDay } from "@some-ui/core-utils"

import type { LibraryBy, TakeFor } from "./model"
import { SEARCH_MAX } from "./model"

const takes = (n: number): string => counted(n, "take")

/** The day, on this phone's calendar. */
const dayAt = (iso: string): string => formatDay(dayOf(new Date(iso)))

export const LIBRARY_WORDS = {
  heading: "Takes on home",
  reading: "Asking home…",
  /** Said with Studio's way to pairing (`STUDIO_WORDS.pair`) beside it (ST34). */
  unpaired:
    "This phone isn't paired with home, so it can't show the takes home keeps.",
  away: "Home can't be reached right now. Try again once you're back in reach.",
  older:
    "Home doesn't list its takes yet. Once it runs a newer version, every take it keeps shows here.",
  unreadable:
    "What home said couldn't be read on this phone. Try again in a moment.",
  readAgain: "Try again",
  searchLabel: "Search the words home heard in your takes",
  searchHint: "A word or two you said",
  search: "Search",
  newest: "Show the newest",
  tooLong: `A search holds at most ${SEARCH_MAX} characters.`,
  none: "Home keeps no takes yet. A take you record in Studio shows here once home has it.",
  /** Which takes the list shows, and how home picked them. */
  shown: (
    by: LibraryBy,
    q: string | null,
    listed: number,
    total: number,
    matched: number | null
  ): string => {
    if (by === "newest" || q === null) {
      return listed < total
        ? `The newest ${listed} of the ${takes(total)} home keeps.`
        : `The ${takes(total)} home keeps, newest first.`
    }
    const found = matched ?? listed
    if (found === 0) {
      return by === "meaning"
        ? `No take home keeps is close in meaning to “${q}”.`
        : `No take's words hold “${q}”.`
    }
    const how =
      by === "meaning"
        ? `closest in meaning to “${q}”`
        : `whose words hold “${q}”`
    return listed < found
      ? `The newest ${listed} of ${takes(found)} ${how}.`
      : `${takes(found)} ${how}, newest first.`
  },
  notHeard: "Home hasn't heard this take yet.",
  silent: "Home heard no words in this take.",
  setAside: (at: string): string =>
    `Set aside ${dayAt(at)}. Home still keeps it.`,
  /** A take's line: what it is for, and when it was recorded. */
  line: (what: TakeFor, recordedAt: string): string =>
    `${LIBRARY_WORDS.what[what]} · ${dayAt(recordedAt)}`,
  what: {
    scene: "For a video's scene",
    idea: "For an idea",
    other: "A take",
  } satisfies Record<TakeFor, string>,
  play: "Play this take",
  stop: "Stop this take",
  loading: "Getting it from home…",
  unplayable:
    "Home couldn't give this take back just now. Try again in a moment.",
  /** Recording a take with no scene yet, on this phone (ST32). */
  record: "Record a take",
  recordLine:
    "An idea, a line or an aside, before there's a scene for it. It goes home, and shows in the list below once home has it.",
  recordLabel: "A take with no scene yet",
  /** The phone holds `max` takes home doesn't have yet. */
  phoneFull: (count: number): string =>
    `This phone holds ${takes(count)} home doesn't have yet. Once home has some, there's room for another.`,
} as const
