/**
 * What Studio's index and its eight pages say (SFEED1, #2731): every word in
 * one pure table, in the person's terms, held by its test to no machinery
 * and to ST34's names: Studio is never "Journal", a take never "a
 * recording" or "a bite", and no place is a bare "Your video". A feed's own
 * words (its name, how an episode is labelled) stay `FEED_WORDS`
 * (`lib/call-videos/words`); these add what it is fed and when it runs.
 */
import { counted } from "@some-ui/core-utils"

import type { Feed } from "@/lib/feeds"

import type { StudioKind } from "./index"

type KindWords = {
  /** Its name, on its tile and over its page. */
  readonly name: string
  /** What it holds, under the name on its tile. */
  readonly line: string
}

export const KIND_WORDS = {
  asks: {
    name: "Asks",
    line: "What waits on you to decide",
  },
  clips: {
    name: "Clips",
    line: "What a change built, as you'd see it",
  },
  episodes: {
    name: "Episodes",
    line: "Every video your feeds made, and the ones you're making",
  },
  feedback: {
    name: "Feedback",
    line: "What you said about an episode, and where it went",
  },
  feeds: {
    name: "Feeds",
    line: "Each intuition you fed in, and what it makes",
  },
  intuitions: {
    name: "Intuitions",
    line: "What you fed in: each feed's question and every idea",
  },
  takes: {
    name: "Takes",
    line: "Everything you've said, kept on home and this phone",
  },
  templates: {
    name: "Templates",
    line: "How each kind of video looks",
  },
} as const satisfies Record<StudioKind, KindWords>

/**
 * Each feed's name, what it is fed, and when it runs. The name is the one
 * its videos' screens use too (`FEED_WORDS`' `heading`), so a feed has one
 * name everywhere (ST34).
 */
type FeedFacts = {
  readonly name: string
  readonly intuition: string
  readonly cadence: string
}

export const FEED_FACTS = {
  call: {
    name: "The weekly call",
    intuition: "Where the repositories stand, so I can guide what comes next.",
    cadence: "Every Friday",
  },
  "playoff-delta": {
    name: "Playoff Delta",
    intuition:
      "How did this week's results move my team's paths to the playoffs?",
    cadence: "Every Tuesday in season",
  },
} as const satisfies Record<Feed, FeedFacts>

export const STUDIO_INDEX_WORDS = {
  heading: "Studio",
  aToZ: "Listed A to Z. None comes first.",
  deleting: "Deleting any of it happens in one place:",
  myData: "Settings › My data",
  /** The way back from a kind's page to the index. */
  back: "Back to Studio",
  /** The way back from an item's page to its kind's. */
  backTo: (kind: StudioKind): string => `Back to ${KIND_WORDS[kind].name}`,
  tryAgain: "Try again",

  asks: {
    intro:
      "Each is a decision only you can make. Answering by voice comes to Studio later. For now, answer one on its page.",
    reading: "Reading what waits on you…",
    away: "The asks couldn't be read. Try again in a moment.",
    stale: "The asks couldn't be read again, so this is what was read before.",
    none: "Nothing waits on you.",
    from: { "some-ui": "About the apps", server: "About home" },
    heading: "An ask",
    unread:
      "This ask can't be read here. Its page on GitHub says what it asks.",
    whyYours: "Why it's yours",
    options: "The options",
    recommended: "Recommended",
    unblocks: (what: string): string => `Unblocks ${what}`,
    open: "Answer it on its page",
    gone: "This ask isn't waiting any more.",
  },

  clips: {
    intro:
      "A clip shows what a change built, as you'd see it: in the app, on a dashboard, or at a command line. Code records it from sample data, before and after the change. Every one is kept here, and only some are picked for an episode.",
    none: "No clips yet. The first ones come with the change that records them.",
  },

  episodes: {
    intro: "Every video your feeds made, by feed, the newest first.",
    making: "Videos you're making",
    makingLine:
      "Made in sittings from your takes: record, watch, shape, finish.",
    open: "Open",
    gone: "Home doesn't have this episode any more.",
  },

  feedback: {
    intro:
      "A note on an episode, at a moment in it: what kind of thing it is, what you said, and where it went.",
    none: "No feedback yet. Leave a note on an episode while it plays, from its page under Episodes.",
  },

  feeds: {
    intro:
      "Each feed is an intuition you fed in. Claude fills each episode, and home voices it and makes the video.",
    intuition: "The intuition",
    cadence: "When it runs",
    templates: "Made with",
    episodes: "Its episodes",
  },

  intuitions: {
    intro:
      "What you fed in: the question each feed answers, and every idea you caught.",
    feeds: "Feeds",
    fed: (feed: string): string => `Feeds ${feed}`,
    ideas: "Ideas",
    /** Your ideas' tile, by how many this phone keeps (`null`: unreadable). */
    onPhone: (n: number | null): string =>
      n === null
        ? "Every idea you caught, and what home keeps of them"
        : n === 0
          ? "No ideas on this phone yet"
          : `${counted(n, "idea")} on this phone`,
    openIdeas: "Your ideas",
  },

  takes: {
    /** Under What Studio keeps (soundbites' `records.open`) on its tile. */
    keptLine:
      "Every take, with what home holds of it, and where to let one go.",
  },

  templates: {
    intro:
      "How each kind of video looks. It's the same for every episode, and the AI fills only what's said.",
    version: (n: number): string => `Version ${String(n)}`,
    usedBy: (feed: string): string => `Used by ${feed}`,
    inOrder: "In order",
    who: "Who made this",
    whoLine:
      "Always first. Code fills it from the episode, and it can't be removed.",
    brandIn: "Your brand intro",
    brandOut: "Your brand outro",
    brandLine: "Your mark",
    chapter: "A chapter slide, said aloud",
    upTo: (n: number): string => `Up to ${String(n)}, one each`,
    sometimes: "Left out when there's nothing to say",
    captions: "Captions",
    /** Whether the words said are captioned, in the template's own look (SFEED11). */
    captioned: {
      word: "Each line captioned in the template's look",
      line: "Each line captioned in the template's look",
      off: "No captions",
    },
    chapters: (n: number): string =>
      `${counted(n, "chapter slide")} said aloud`,
    noShape:
      "Made before templates had a shape: no intro, chapters or captions.",
  },
} as const
