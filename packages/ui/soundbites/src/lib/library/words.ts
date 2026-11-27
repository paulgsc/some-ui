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
  Order,
  TakeAbout,
  TakeKind,
  TakePlace,
  TakeStatus,
} from "./compartments"
import type { AboutPortWords } from "./kinds"
import type { LibraryBy } from "./model"
import { SEARCH_MAX } from "./model"

const takes = (n: number): string => counted(n, "take")

/**
 * What the kinds' ports say that isn't data (`./kinds`): a week, a
 * teleprompter read, a game named only by its day, the play a bite was
 * matched to or that none was found, a soundbite's start.
 */
export const ABOUT_WORDS: AboutPortWords = {
  week: (n) => `Week ${String(n)}`,
  read: "Read aloud",
  gameOn: (day) => `A game on ${day}`,
  aGame: "A game",
  atPlay: (period, clock) =>
    [period > 4 ? "OT" : `Q${String(period)}`, clock].filter(Boolean).join(" "),
  noPlay: "Not matched to a play",
  soundbiteFrom: (source) =>
    source === "direct" ? "Recorded on Soundbites" : "Recorded from a lesson",
}

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
  searchLabel: "Search what you said and what it was about",
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
    matched: number | null,
    /** The order the list is in; newest first when absent. */
    order: Order = "newest",
    /** One of Studio's compartments, whose count is all of Studio's takes. */
    studio = false
  ): string => {
    const keeps = studio ? "home keeps from Studio" : "home keeps"
    const first =
      order === "oldest"
        ? "oldest first"
        : order === "topic"
          ? "by what each is about"
          : "newest first"
    if (by === "newest" || q === null) {
      if (listed >= total) return `The ${takes(total)} ${keeps}, ${first}.`
      return order === "oldest"
        ? `The oldest ${listed} of the ${takes(total)} ${keeps}.`
        : order === "topic"
          ? `${listed} of the ${takes(total)} ${keeps}, by what each is about.`
          : `The newest ${listed} of the ${takes(total)} ${keeps}.`
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
      : `${takes(found)} ${how}, ${first}.`
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
    spoken: {
      one: "For a spoken card",
      many: "Spoken cards",
      line: "Takes of a spoken card's parts, each card on its own.",
    },
    here: {
      one: "Recorded here",
      many: "Recorded here",
      line: "Takes recorded on Takes itself, before there's anything they're for.",
    },
    bite: {
      one: "At a game",
      many: "Game day",
      line: "What you say during a game, at its moment.",
    },
    round: {
      one: "On Rust Rounds",
      many: "Rust Rounds",
      line: "What you say on a Rust Rounds card or a week's ticket.",
    },
    interview: {
      one: "For interview week",
      many: "Interview week",
      line: "What you say to a week's questions, and what you read aloud.",
    },
    reflection: {
      one: "A reflection",
      many: "Reflections",
      line: "What you say after a study session.",
    },
    jobs: {
      one: "On a job",
      many: "Jobs",
      line: "What you say about a job you picked or passed.",
    },
    drama: {
      one: "For the drama",
      many: "Drama",
      line: "The drama's next scene, said aloud.",
    },
    soundbite: {
      one: "A soundbite",
      many: "Soundbites",
      line: "Short things you say on Soundbites or in a lesson.",
    },
    lens: {
      one: "A line read aloud",
      many: "Grammar lens",
      line: "Lines you read aloud in the grammar lens.",
    },
    leetype: {
      one: "On LeetType",
      many: "LeetType",
      line: "What you say to a LeetType screen.",
    },
    hunch: {
      one: "Something to say in Korean",
      many: "Korean to say",
      line: "What you said you wanted to say, to find it in Korean.",
    },
    other: {
      one: "Another kind",
      many: "Other takes",
      line: "Takes of a kind this app doesn't name yet. A newer app shows them in their own place.",
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
  /** A spoken card this phone doesn't keep, named by nothing more. */
  aSpokenCard: "A spoken card",
  /** The chips picked show no take. */
  noneUnder: "No take here is where you picked. Tap a chip again to show all.",
  /** What a take's card says first: what it was said for. */
  subject: (about: TakeAbout): string | null => {
    if ("parts" in about) return about.topic?.label ?? null
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
      case "spoken": {
        return about.title ?? LIBRARY_WORDS.aSpokenCard
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
    if ("parts" in about) {
      return about.parts.length === 0 ? null : about.parts.join(" · ")
    }
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
      case "spoken": {
        return `Part ${String(about.part + 1)}`
      }
      case "here": {
        return null
      }
      default: {
        return assertNever(about)
      }
    }
  },
  /** How a take stands, on its chip. */
  status: {
    heard: "Heard",
    waiting: "Not heard yet",
    silent: "No words heard",
    aside: "Set aside",
    "let-go": "Audio deleted",
    deleted: "Deleted",
  } satisfies Record<TakeStatus, string>,
  /** A take whose recording is gone: what its card says instead of Play. */
  letGone: (status: "let-go" | "deleted"): string =>
    status === "deleted"
      ? "Deleted for good. Home keeps a receipt of what went."
      : "Its audio was deleted. Home keeps what it heard in it.",
  /** The next page, older than the takes shown. */
  showOlder: "Show more takes",
  olderReading: "Asking home for more takes…",
  olderUnread: "Home couldn't be reached just then. Try again in a moment.",
  /** The list changed on home since it was read: only reading it again helps. */
  listChanged:
    "The list changed on home since it was read. Read it again to see more.",
  /** How a list is ordered. */
  order: {
    newest: "Newest",
    oldest: "Oldest",
    topic: "By what it's about",
  } satisfies Record<Order, string>,
  orderLabel: "Order the takes",
  /** The phone's own takes, of any kind, that home doesn't list. */
  waitsHere: "Only on this phone so far. It shows from home once home has it.",
  /** One home now holds, not in the list read before it went: it joins on a fresh read. */
  homeHasIt:
    "Home has it now. It joins home's list when the list is read again.",
  /** Counts on the chips are of what was read; home keeps more. */
  countedSoFar: (listed: number, total: number): string =>
    `Counted from the ${String(listed)} read so far of the ${takes(total)} home keeps. Show more to count the rest.`,
  /** One home holds that its list doesn't show yet: what waits on a newer home. */
  homeLater:
    "Home keeps it. What home heard in it shows here once home runs a newer version.",
  /**
   * A home that lists only Studio's takes: what waits on a newer one
   *. The phone's own still show.
   */
  studioOnly:
    "Home lists only Studio's takes until it runs a newer version. Your other takes show here once it does, and those still on this phone show here now.",
  /** A take's moment in a game, said beside it: its game's page. */
  openGame: "Open its game",
  said: (recordedAt: string): string => `Said ${dayAt(recordedAt)}`,
  /** Where a take is, on its card and its chip. */
  place: {
    phone: "On this phone",
    home: "On home",
  } satisfies Record<TakePlace, string>,
  onHomeSince: (storedAt: string): string => `On home since ${dayAt(storedAt)}`,
  /** A topic opened by a link that didn't name it. */
  picked: "What you picked",
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
