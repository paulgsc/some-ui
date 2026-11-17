/**
 * Every word Takes on home says (ST32), in one pure table, in the person's
 * terms: what home keeps and what it heard, and which search ran, never the
 * machinery. "Take" is the one word for a recording here (ST34).
 * `__tests__/words.test.ts` holds both.
 */
import {
  assertNever,
  counted,
  dayOf,
  formatDay,
  formatTimecode,
} from "@some-ui/core-utils"

import type {
  Compartment,
  TakeAbout,
  TakeKind,
  TakePlace,
} from "./compartments"
import type { LibraryBy } from "./model"
import { SEARCH_MAX } from "./model"

const takes = (n: number): string => counted(n, "take")

/** The day, on this phone's calendar. */
export const dayAt = (iso: string): string => formatDay(dayOf(new Date(iso)))

export const LIBRARY_WORDS = {
  heading: "Takes on home",
  /** What a pull down reads again, for "Couldn't check … just now". */
  pullWhat: "your takes on home",
  reading: "Asking home…",
  /** Said with Studio's way to pairing (`STUDIO_WORDS.pair`) beside it (ST34). */
  unpaired:
    "This phone isn't paired with home, so it can't show the takes home keeps.",
  away: "Home can't be reached right now. Try again once you're back in reach.",
  busy: "This phone was busy with home just then. Try again in a moment.",
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
  /**
   * What each kind of take was said for (TAKES2, TAKES3): its name on a
   * take's card (`one`), on its tile and as its page's heading (`many`),
   * and what goes there, said on its tile.
   */
  kinds: {
    note: {
      one: "On an episode",
      many: "On episodes",
      line: "What you say on an episode, at its moment.",
    },
    scene: {
      one: "For a video's scene",
      many: "Scenes",
      line: "Takes for a scene of a video you're making.",
    },
    idea: {
      one: "For an idea",
      many: "Ideas",
      line: "What you say to an idea's questions.",
    },
    ask: {
      one: "For an ask",
      many: "Asks",
      line: "What you say on an ask's page, deciding it.",
    },
    here: {
      one: "Recorded here",
      many: "Recorded here",
      line: "Takes recorded on Takes itself, before there's anything they're for.",
    },
  } satisfies Record<
    TakeKind,
    { readonly one: string; readonly many: string; readonly line: string }
  >,
  all: "All takes",
  allLine: "Every kind together, newest first.",
  /** A compartment's heading. */
  compartmentHeading: (compartment: Compartment): string =>
    compartment === "all"
      ? LIBRARY_WORDS.all
      : LIBRARY_WORDS.kinds[compartment].many,
  /** The tiles count only what home listed, when it listed fewer than it keeps. */
  counted: (listed: number, total: number): string =>
    `Counted from the newest ${String(listed)} of the ${takes(total)} home keeps.`,
  /** A compartment that holds no take. */
  empty: (compartment: Compartment): string =>
    compartment === "all"
      ? "No takes yet. Each kind fills its own place as you say things for it."
      : `None yet. ${LIBRARY_WORDS.kinds[compartment].line}`,
  /** The chips picked show no take. */
  noneUnder: "No take here is where you picked. Tap a chip again to show all.",
  /** What a take's card says first: what it was said for. */
  subject: (about: TakeAbout): string | null => {
    switch (about.kind) {
      case "note": {
        return `${about.feed} · ${about.episode}`
      }
      case "scene": {
        return about.video ?? "A video you're making"
      }
      case "idea": {
        return about.question ?? "One of an idea's questions"
      }
      case "ask": {
        return (
          about.ask ??
          (about.number === null
            ? "An ask"
            : `The ask #${String(about.number)}`)
        )
      }
      case "here": {
        return null
      }
      default: {
        return assertNever(about)
      }
    }
  },
  /** What the card says under it, when the phone knows more. */
  detail: (about: TakeAbout): string | null => {
    switch (about.kind) {
      case "note": {
        return `At ${formatTimecode(about.atMs)}`
      }
      case "scene": {
        return about.scene === null ? null : `Scene ${String(about.scene)}`
      }
      case "idea": {
        return about.idea === null ? null : `About “${about.idea}”`
      }
      case "ask": {
        return about.ask === null || about.number === null
          ? null
          : `#${String(about.number)}`
      }
      case "here": {
        return null
      }
      default: {
        return assertNever(about)
      }
    }
  },
  /** When a take was said. */
  said: (recordedAt: string): string => `Said ${dayAt(recordedAt)}`,
  /** Where a take is, on its card and its chip. */
  place: {
    phone: "On this phone",
    home: "On home",
  } satisfies Record<TakePlace, string>,
  onHomeSince: (storedAt: string): string => `On home since ${dayAt(storedAt)}`,
  /** What a row of chips does, for a reader that can't see it. */
  chips: "Show only the takes",
  /** The way from a note's take to its episode, at the moment it was left. */
  openEpisode: (atMs: number): string =>
    `Open the episode at ${formatTimecode(atMs)}`,
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
