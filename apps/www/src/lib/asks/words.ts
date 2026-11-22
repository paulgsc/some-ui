/**
 * Every word the Asks pages say (`routes/_dashboard/_lan/asks*`), in the
 * owner's terms: what waits on them, what each choice or step lets go
 * ahead, and where what they do is kept (this tab, until they copy it).
 * `./__tests__/words.test.ts` holds that none names the machinery.
 */
import type { AskCall, AskWaits } from "@some-ui/video-render"

import type { AskView, Order, Show } from "./list"

export const ASKS_WORDS = {
  title: "Asks",
  intro:
    "What waits on you: decisions only you can make, and checklists of steps only you can take, such as setting up a key. Each is an issue on GitHub, and closing it answers it.",
  kept: "What you choose, tick off and paste here stays in this tab, and goes when you close it. Anything that looks like a key or a password is blanked before it's kept. Copy the receipt into the session working on the ask to hand it over.",
  reading: "Reading what waits on you…",
  away: "The asks couldn't be read. Try again in a moment.",
  stale: "The asks couldn't be read again, so this is what was read before.",
  tryAgain: "Try again",
  nav: "Asks by kind",
  views: {
    decision: "Decisions",
    checklist: "Checklists",
    pivot: "By call and who waits",
  } satisfies Record<AskView, string>,
  noneOf: {
    decision: "No decision is here yet.",
    checklist: "No checklist is here yet.",
  } satisfies Record<Exclude<AskView, "pivot">, string>,
  noneShown: "No ask here matches what you picked.",
  unreadHere: (n: number): string =>
    n === 1
      ? "One ask can't be read here:"
      : `${String(n)} asks can't be read here:`,
  all: "All",
  unsaid: "Not said",
  waits: {
    claude: "Claude",
    pipeline: "A pipeline",
    home: "Home",
  } satisfies Record<AskWaits, string>,
  calls: {
    architecture: "Architecture",
    mechanical: "Mechanical",
    hardware: "Hardware",
    software: "Software",
    environment: "Environment",
    story: "Story",
    idiom: "Idiom",
  } satisfies Record<AskCall, string>,
  waitsLabel: "Waits on",
  callLabel: "Call",
  showLabel: "Show",
  orderLabel: "Order",
  shows: {
    waiting: "Waiting",
    answered: "Answered",
    all: "All",
  } satisfies Record<Show, string>,
  orders: {
    longest: "Waiting longest",
    newest: "Newest",
    aToZ: "A to Z",
  } satisfies Record<Order, string>,
  asks: "What it asks",
  unblocksColumn: "Unblocks",
  sinceColumn: "Since",
  /** When an ask was filed, or answered, as a day of the year. */
  since: (filed: string, answered: string | null): string => {
    const day = (iso: string): string =>
      new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    return answered === null ? day(filed) : `Answered ${day(answered)}`
  },
  pivotCounts: {
    waiting: "Waiting only",
    all: "Answered too",
  } satisfies Record<Extract<Show, "waiting" | "all">, string>,
  pivotCorner: "Call, by who waits",
  inCell: {
    decision: (n: number): string =>
      n === 1 ? "1 decision" : `${String(n)} decisions`,
    checklist: (n: number): string =>
      n === 1 ? "1 checklist" : `${String(n)} checklists`,
  } satisfies Record<Exclude<AskView, "pivot">, (n: number) => string>,
  pivotNone: "No ask is here yet.",
  open: "Its page on GitHub",
  whyYours: "Why it's yours",
  options: "The options",
  recommended: "Recommended",
  unblocks: (what: string): string => `Unblocks ${what}`,
  choose: "Choose this",
  chosen: "You chose this",
  note: "Anything to add (optional)",
  step: (place: number, of: number): string =>
    `Step ${String(place + 1)} of ${String(of)}`,
  where: (where: string): string => `Where: ${where}`,
  paste: "Paste it here (optional)",
  done: "Done",
  doneAgain: "Done again",
  isDone: "Done",
  receipt: "Receipt",
  copyWhat: "the receipt",
  receiptHolds: (n: number): string =>
    `It holds ${n === 1 ? "one thing" : `${String(n)} things`} you did here, ready to copy.`,
  stepsDone: (done: number, of: number): string =>
    `${String(done)} of ${String(of)} steps done`,
} as const
