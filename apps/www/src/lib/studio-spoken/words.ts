/**
 * What Studio's Spoken says (W5; the owner's approved prototype of
 * 2026-11-20, renamed "spoken" the same day): every word in one pure table,
 * in the person's terms, held by its test to no machinery. A take is never
 * "a recording" (ST34), and what is kept where is said plainly: a spoken
 * card on this phone, every take on home.
 */
import { counted } from "@some-ui/core-utils"

import type { Category, EssayPart, PartKind } from "./model"

const KIND: Readonly<Record<PartKind, string>> = {
  read: "Read",
  own: "Own words",
}

const CATEGORY: Readonly<Record<Category, string>> = {
  introduction: "Introduction",
}

export const SPOKEN_WORDS = {
  heading: "Spoken",
  intro:
    "Spoken cards: what you read aloud, part by part, and every take of it.",
  paste: {
    open: "Paste a spoken card",
    heading: "Paste a spoken card",
    label: "The spoken card",
    how: "A line saying CATEGORY names its kind: introduction, for now. A line saying SCRIPT starts words to read, and OWN WORDS something to say in your own words. A QUESTION line in a part is what Kokoro asks before it.",
    plain:
      "With no SCRIPT or OWN WORDS lines, each paragraph is a part to read. You can change a part's kind until it has a take.",
    keep: "Keep this card",
    cancel: "Not now",
    nothing:
      "Nothing to keep yet: paste the words to read, with a category Studio knows (introduction).",
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
  category: CATEGORY,
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
    line: "Paste this into the session making the essay. It names the card's category and each question with the take that answers it: Kokoro asks, then your take plays. The essay plays your takes from home as you said them.",
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
    time: (ms: number): string => {
      const s = Math.floor(ms / 1000)
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
    },
  },
} as const

/** The block "Copy for the essay" copies: the category, each question and its take. */
export function essayBlock(
  card: {
    readonly title: string
    readonly id: string
    readonly category: Category
  },
  parts: ReadonlyArray<EssayPart>
): string {
  const head = [
    `Spoken card: ${card.title === "" ? SPOKEN_WORDS.untitled : card.title} (${card.id})`,
    `Category: ${card.category}`,
  ]
  const lines = parts.flatMap((part) => [
    `Part ${part.n + 1}, ${part.kind === "read" ? "read" : "own words"}`,
    ...(part.ask === null ? [] : [`  Asks: ${part.ask}`]),
    part.take === null ? `  No take yet` : `  From take ${part.take}`,
  ])
  return [...head, ...lines].join("\n")
}
