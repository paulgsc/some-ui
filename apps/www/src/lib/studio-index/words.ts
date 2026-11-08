/**
 * What Studio's index and its eight pages say (SFEED1, #2731): every word in
 * one pure table, in the person's terms, held by its test to no machinery
 * and to ST34's names: Studio is never "Journal", a take never "a
 * recording" or "a bite", and no place is a bare "Your video". A feed's own
 * words (its name, how an episode is labelled) stay `FEED_WORDS`
 * (`lib/call-videos/words`); these add what it is fed and when it runs.
 */
import { counted, formatDay, formatTimecode } from "@some-ui/core-utils"

import type { Feed } from "@/lib/feeds"
import { formatDurationMs } from "@/lib/format"

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

/** The places a feed leaves something, in the order a feed's page lists them. */
export const PLACES = ["home", "phone", "testing", "drive"] as const

type Place = (typeof PLACES)[number]

type Kept = { readonly what: string; readonly letGo: string }

/** My data's two steps for an episode (`lib/my-data/words`' videos). */
const HOME_LETS_GO =
  "Once an episode's YouTube link is saved, Settings › My data lets its video go, then what it was made from, and home keeps a note of each. Its words stay."

const ON_THE_PHONE: Kept = {
  what: "Your notes on its episodes, under Feedback, and a copy of each episode you watched.",
  letGo:
    "Your notes are kept. A watched copy is the phone's to clear, and it goes when home's video is let go.",
}

const NOTHING_IN_DRIVE: Kept = {
  what: "Nothing. This feed keeps nothing in Drive.",
  letGo: "Nothing to let go.",
}

/**
 * What each feed leaves behind, and where (SFEED8, #2748). Nothing more can be
 * let go than My data already offers (the owner's ruling on ask #2749).
 */
export const FEED_KEPT = {
  call: {
    home: {
      what: "Every week Claude wrote for the call, as home first read it, and each episode's video and what it was made from.",
      letGo: HOME_LETS_GO,
    },
    phone: ON_THE_PHONE,
    testing: {
      what: "Each week's words, in the public paulgsc/testing. Only the newest weeks stay there: an older one leaves once home holds it.",
      letGo: "Never by hand. Home keeps every week.",
    },
    drive: NOTHING_IN_DRIVE,
  },
  "playoff-delta": {
    home: {
      what: "Every week's words Claude wrote, with the season as it stood that week, and each episode's video and what it was made from.",
      letGo: HOME_LETS_GO,
    },
    phone: ON_THE_PHONE,
    testing: {
      what: "The season's numbers and every week's words, in the public paulgsc/testing.",
      letGo: "Never. A week's words are kept as they were written.",
    },
    drive: NOTHING_IN_DRIVE,
  },
} as const satisfies Record<Feed, Record<Place, Kept>>

/** A length in seconds as said: "3.2 seconds", "4 seconds". */
const seconds = (s: number): string =>
  `${String(s)} ${s === 1 ? "second" : "seconds"}`

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
      "Each is a decision only you can make. Answer one by voice on its page, or on GitHub.",
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
    open: "Answer it on GitHub",
    answer: {
      label: "Your answer",
      line: "Say which option, or what you'd rather. Home keeps what you say, and the morning routine files it as an issue that waits for you to start on it. The ask stays open until you do.",
      unpaired:
        "Only home hears an answer, and this phone isn't paired with it. Pair it in Settings, or answer on GitHub.",
      noVoice: "This phone can't record here. Answer it on GitHub instead.",
      again: "Say another answer",
      heard: "Home heard",
      hearingLine:
        "Your answer is kept. Its words come back from home in a minute or two, and you can leave this page.",
      kept: {
        late: "Home has your answer and hasn't heard it yet. It's filed once home has.",
        noWords:
          "Home has your answer but can't give its words back. If it never hears them, nothing is filed: answer on GitHub to be sure.",
        awayOnHome:
          "Home can't be reached right now. It already has your answer.",
        awayOnPhone:
          "Home can't be reached right now. Your answer is kept on this phone and goes home once home is in reach.",
      },
      notice: {
        silent: "Didn't hear anything. Try again.",
        notStarted:
          "Your answer can't be taken right now. Try again in a moment.",
        full: "There's no room on this phone for another take until home has the ones before it.",
        notKept: "Couldn't keep that answer. Try again.",
      },
    },
    gone: "This ask isn't waiting any more.",
  },

  clips: {
    intro:
      "A clip shows what a change built, as you'd see it: in the app, on a dashboard, or at a command line. Code records it from sample data, before and after the change. Every one is kept here, and only some are picked for an episode.",
    none: "No clips yet. The first ones come with the change that records them.",
    reading: "Reading the Library…",
    away: "The Library couldn't be read. Try again in a moment.",
    stale:
      "The Library couldn't be read again, so this is what was read before.",
    gone: "This clip isn't in the Library any more.",
    landed: (day: string): string => `Landed ${formatDay(day)}`,
    before: "Before",
    after: "After",
    nothingBefore: "New with this change: there was nothing to show before.",
    walked: "Code recorded it from sample data.",
    recorded: "Taken by the session that made the change, from sample data.",
    open: "See the change",
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
    kept: "Where it's kept",
    places: {
      home: "On home",
      phone: "On this phone",
      testing: "In the public record",
      drive: "In Drive",
    } satisfies Record<Place, string>,
    /** Before the size of what home holds of a feed's episodes. */
    homeHolds: "Its episodes take up on home:",
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
    /** The storyboard (SFEED3): every frame of one episode, from its sample. */
    frames: "Every frame, before it's filled",
    drawnFrom: (sample: string): string =>
      `Drawn from ${sample}. Grey bars are what the AI writes. The rest is the template's, as every episode has it.`,
    inAll: (ms: number): string => `About ${formatDurationMs(ms)} in all`,
    /** Where a frame starts and about how long it holds: "1:05, about 9 seconds". */
    when: (atMs: number, ms: number): string =>
      `${formatTimecode(atMs)}, about ${counted(Math.max(1, Math.round(ms / 1000)), "second")}`,
    who: "Who made this",
    whoLine:
      "Always first. Code fills it from the episode, and it can't be removed.",
    brandIn: "Your brand intro",
    brandOut: "Your brand outro",
    brandLine: "Your mark",
    chapter: (section: string): string => `Chapter slide: ${section}`,
    /** One item of a section that shows once per item: "Where we are, 2". */
    item: (section: string, n: number): string => `${section}, ${String(n)}`,
    aiWrites: "The AI writes what's said here",
    nothingSaid: "Nothing is said",
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
    /** The release promo (C32): made for each release of an app, from its walk. */
    promo: {
      name: "Release promo",
      line: "Made for each release of an app",
      intro:
        "A short vertical video for each release of an app: its name, the app itself screen by screen, and where to get it. The same for every release, and the AI writes only the words.",
      scenes: "Its three scenes",
      hook: "The opening: the app's name, its version, and two facts on chips",
      feature:
        "The app, screen by screen, as its walk shows it, one caption each",
      featureFor: (before: number, after: number): string =>
        `As long as the app's walk, with ${seconds(before)} before and ${seconds(after)} after`,
      close: "Where to get it, with two badges",
      lasts: (s: number): string => `${seconds(s)} long`,
      writes: "What the AI writes",
      title: "The app's name",
      caption: "A caption for each screen",
      cta: "Where to get it",
      badge: "Each of the two badges",
      limit: (lines: number, chars: number): string =>
        lines === 1
          ? `One line, up to ${counted(chars, "character")}`
          : `Up to ${counted(lines, "line")} of ${counted(chars, "character")}`,
      sounds: "Its sounds come from the kit home keeps, on each scene's moves.",
      made: "Made on home for a release once its walk is recorded. There's no preview of it here.",
    },
    /** The caption look control (SFEED11, #2707). */
    look: {
      label: "The caption look",
      named: (look: string): string => `Captioned in the ${look} look`,
      line: "Change it here, then open it as a GitHub issue. Once the change is in the code, the next video uses it. Nothing changes until then.",
      sample: ["Third", "and", "long,", "eleven", "to", "go"],
      weight: "Weight",
      bold: "Bold",
      heavy: "Heavy",
      size: "Size",
      text: "Words",
      lit: "The word being said",
      litOn: "Light the word being said",
      stroke: "Outline",
      strokeWidth: "Outline width",
      plate: "A plate behind the words",
      plateColour: "Plate",
      plateOpacity: "Plate opacity",
      popIn: "Pop-in",
      popInMs: (ms: number): string =>
        ms === 0
          ? "Every word at once"
          : `Each word in ${(ms / 1000).toFixed(2)} s`,
      sendLine:
        "Opens a new issue holding this look, for you to file. Videos already made keep the look they were drawn in.",
      none: "This template names no caption look.",
    },
    /** Sending a setting changed here (SFEED11, SFEED14). */
    issue: {
      send: "Open it as a GitHub issue",
      unchanged: "Change something to open it as an issue.",
      reset: "Start over",
    },
    /** The mark's theme control (SFEED14, #2766). */
    mark: {
      label: "The mark's theme",
      named: (theme: string): string =>
        `The brand intro and outro draw the mark in ${theme}`,
      own: "The brand intro and outro draw the mark in the app's own theme",
      line: "Choose a theme, then open it as a GitHub issue. Once the change is in the code, the next video uses it. Nothing changes until then.",
      choose: "Draw the mark in",
      sendLine:
        "Opens a new issue holding this theme, for you to file. Videos already made keep the mark they were drawn in.",
    },
  },
} as const
