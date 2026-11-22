/**
 * What Studio's Spoken says (W5): every word in one pure table,
 * in the person's terms, held by its test to no machinery. A take is never
 * "a recording" (ST34), and what is kept where is said plainly: a spoken
 * card on this phone, every take on home.
 */
import { counted, formatTimecode } from "@some-ui/core-utils"
import {
  SPOKEN_CATEGORIES,
  SPOKEN_CATEGORY_TITLES,
} from "@some-ui/video-render"

import type { PartKind, SpokenCard } from "./model"

/** The categories a pasted card may name, as its CATEGORY line spells them. */
const NAMES = SPOKEN_CATEGORIES.join(" or ")

const KIND: Readonly<Record<PartKind, string>> = {
  read: "Read",
  own: "Own words",
}

export const SPOKEN_WORDS = {
  heading: "Spoken",
  intro:
    "Spoken cards: what you read aloud, part by part, and every take of it.",
  paste: {
    open: "Paste a spoken card",
    heading: "Paste a spoken card",
    label: "The spoken card",
    how: `A line saying CATEGORY names its kind: ${NAMES}. A line saying SCRIPT starts words to read, and OWN WORDS something to say in your own words. A QUESTION line in a part is what Kokoro asks before it.`,
    most: (parts: number): string =>
      `Only the first ${parts} parts are kept: paste the rest as another card.`,
    plain:
      "With no SCRIPT or OWN WORDS lines, each paragraph is a part to read. You can change a part's kind until it has a take.",
    keep: "Keep this card",
    cancel: "Not now",
    nothing: `Nothing to keep yet: paste the words to read, with a category Studio knows (${NAMES}).`,
    notKept:
      "This phone couldn't keep the card. Free some room in Settings › My data, then keep it again.",
    split: (read: number, own: number, asks: number): string =>
      [
        `${KIND.read} · ${read}`,
        `${KIND.own} · ${own}`,
        ...(asks > 0 ? [`Questions · ${asks}`] : []),
      ].join("   "),
  },
  none: "No spoken cards yet. Paste one to read it on the teleprompter.",
  kept: "Each spoken card is kept on this phone. Every take of it is kept on home, with the card and part it reads.",
  untitled: "A spoken card with no title",
  category: SPOKEN_CATEGORY_TITLES,
  pasted: (at: string): string =>
    `Pasted ${new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
  summary: (parts: number, takes: number): string =>
    `${counted(parts, "part")} · ${takes === 0 ? "no takes yet" : counted(takes, "take")}`,
  kind: KIND,
  flip: (to: PartKind): string =>
    to === "own" ? "Say it in your own words" : "Read it instead",
  part: (n: number, of: number): string => `Part ${n + 1} of ${of}`,
  partShort: (n: number): string => `Part ${n + 1}`,
  asks: (ask: string): string => `Kokoro asks: ${ask}`,
  theyAsk: "Kokoro asks",
  partTakes: (takes: number, using: number | null): string =>
    takes === 0
      ? "No take yet"
      : `${counted(takes, "take")}${using === null ? "" : ` · using take ${using}`}`,
  own: {
    hint: "Say it however it comes. Nothing scrolls.",
    cap: "Up to 3 minutes a take.",
  },
  record: "Record a take",
  recordAgain: "Record again",
  recordLine: "Each take is kept. Saying it again adds one.",
  takes: (n: number): string => counted(n, "take"),
  take: (n: number): string => `Take ${n}`,
  where: {
    phone: "on this phone, going home",
    home: "on home",
  },
  using: "Using",
  useThis: "Use this one",
  play: "Play",
  stop: "Stop",
  notPlayed:
    "That take isn't on this phone and home couldn't send it now. Try again at home.",
  heard: {
    waiting: "Home hears it once it's there.",
    none: "Home couldn't hear this one well, so an essay can't use it.",
  },
  copy: {
    heading: "Copy for the essay",
    line: "Paste this into the session making the essay. It names the card's category and each of your takes, with any question Kokoro asks before it. The essay plays your takes from home as you said them.",
    what: "the card's takes for the essay",
  },
  lost: "This spoken card isn't on this phone.",
  back: "Spoken",
  band: {
    script: "Your words",
    ready: "Ready when you are",
    band: {
      waiting: "Starts when you speak",
      moving: "Moving with you",
      holding: "Waiting for you",
      paused: "Paused",
    },
    pause: "Pause",
    goOn: "Go on",
    slower: "Slower",
    faster: "Faster",
    pace: (wpm: number): string => `${wpm} words a minute`,
    time: formatTimecode,
  },
} as const

/** A card's title, or what one with none is called. */
export const titleOf = (card: Pick<SpokenCard, "title">): string =>
  card.title === "" ? SPOKEN_WORDS.untitled : card.title

/** The block "Copy for the essay" copies: the category, each question and its take. */
export function essayBlock(card: SpokenCard): string {
  const head = [
    `Spoken card: ${titleOf(card)} (${card.id})`,
    `Category: ${card.category}`,
  ]
  const lines = card.parts.flatMap((part, n) => [
    `Part ${n + 1}${part.id === null ? "" : ` (${part.id})`}, ${part.kind === "read" ? "read" : "own words"}`,
    ...(part.ask === null ? [] : [`  Asks: ${part.ask}`]),
    part.using !== null
      ? `  From take ${part.using}`
      : part.takes.length === 0
        ? `  No take yet`
        : `  ${counted(part.takes.length, "take")}, none picked yet`,
  ])
  return [...head, ...lines].join("\n")
}
