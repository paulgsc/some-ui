/**
 * Every word the week's screens put on the phone (RR13), in one pure table,
 * held to the owner's rules by `__tests__/words.test.ts` as the cards' are:
 * no score, verdict, "you said", level or streak, nothing that counts time
 * or says "done", and no status code or internal name. rustc's own output
 * is shown as printed, beside these words, never in them. Nothing answers:
 * no word replies to a take, and none calls anything correct.
 *
 * The cards' and the look over's words are the shared bundle's parts'
 * (`@some-ui/shared`'s `BundleWords`), filled in here; a take's own are the
 * take pattern's.
 */
import type { Week } from "@rust-rounds/lib/formats/week"
import type { BundleWords } from "@some-ui/shared"
import { TAKE_WORDS } from "@some-ui/voice-capture"

import { CARD_WORDS, clock, weekday, weekNumber } from "./card-words"

const answers = (n: number): string => (n === 1 ? "1 answer" : `${n} answers`)

const BUNDLE: BundleWords = {
  dot: {
    said: (n) => `Ticket ${n}, said`,
    typed: (n) => `Ticket ${n}, said`,
    failed: (n) => `Ticket ${n}, your voice didn't come through`,
    full: (n) => `Ticket ${n}, no room to record it`,
    later: (n) => `Ticket ${n}, left for later`,
    open: (n) => `Ticket ${n}, not said yet`,
  },
  cardOf: (n, of) => `Ticket ${n} of ${of}`,
  prev: (n) => `← ${n}`,
  next: (n) => `${n} →`,
  last: "Last ticket",
  unsaid: () => "Swipe on to leave it for now.",
  failed: {
    title: "You wanted to say this. Your voice didn't come through.",
    line: "Nothing was kept. Try again, or come back to it later.",
    again: "Try saying it again",
    later: "Come back later",
    type: "",
  },
  full: {
    title: "This phone holds as many takes as it can until home has them.",
    line: "Nothing was kept. Come back to it once home has the takes on this phone.",
  },
  unheard: { type: "" },
  typing: { mark: "", hint: "", left: () => "", voice: "", keep: "" },
  typed: { mark: "", sayInstead: "Say it instead" },
  later: {
    line: "Left for later. It's marked on the dots above.",
    sayNow: "Say it now",
  },
  saidCount: (n, of) => `${n} of ${of} said · all on this phone until you send`,
  toReview: "Look it over before sending",
  review: {
    kept: "Kept on this phone only. Nothing has been sent.",
    playAll: "Play all, in order",
    stopAll: "Stop",
    deleteAll: "Delete all",
    notSaid: "Not said. Sent as it is, it counts as not answered.",
    typed: "",
    sayIt: "Say it",
    delete: "Delete",
  },
  confirm: {
    answerTitle: "Delete this take?",
    answerLine: (label) =>
      `Your take on ${label} hasn't left this phone, so deleting it removes it for good. You can say it again.`,
    besideLine: (label) =>
      `Your take on ${label} hasn't left this phone, so deleting it removes it for good. You can say it again.`,
    allTitle: "Delete every take this week?",
    allLine:
      "None of them has left this phone, so every take this week is removed for good.",
    yes: "Delete for good",
    keep: "Keep it",
  },
  notice: {
    deleted: TAKE_WORDS.discarded,
    deletedAll: TAKE_WORDS.discarded,
    notKept:
      "This phone couldn't keep that change, so it would be lost if you left now.",
    notSent:
      "This phone couldn't keep the week's takes as sent, so nothing went. They're all still here.",
    notDeleted: "That couldn't be deleted, so it's still here.",
  },
}

/** Where a ticket stands, on the brief. */
export type TicketStanding = "open" | "said" | "sent" | "unanswered"

export const WEEK_WORDS = {
  ...BUNDLE,
  title: "Rust Rounds",
  reading: "Opening the week…",
  unreadable:
    "What this phone keeps for the week couldn't be read, so nothing new can be kept yet.",
  readAgain: "Try again",
  back: "Back",
  backToPractice: "Back to Practice",
  /** The brief's heading: "Week 46 · due Sunday 23:59". */
  heading: (week: Pick<Week, "id" | "due">): string =>
    `Week ${weekNumber(week.id)} · due ${weekday(week.due)} ${clock(week.due)}`,
  sla: "What it has to meet",
  tickets: "Tickets",
  standing: {
    open: "Not said",
    said: "Said, on this phone",
    sent: "Sent home",
    unanswered: "Not answered",
  } satisfies Record<TicketStanding, string>,
  /** What a ticket's program did, in a word, once home ran it. */
  compiles: "Compiles",
  doesntCompile: "Doesn't compile",
  speakToCount: (n: number): string => `${n} to speak to`,
  toReviewOf: (n: number, of: number): string =>
    `Look it over before sending · ${n} of ${of}`,
  /** A ticket's card. */
  ticketOf: (id: string, n: number, of: number): string =>
    `${id} · ticket ${n} of ${of}`,
  speakTo: "Speak to",
  guideOn: (id: string): string => `Guide on ${id}`,
  figures: "The scenario's figures, given, not measured",
  rustcSilent: "rustc had nothing to say.",
  printed: "It printed",
  rustcPrinted: "What rustc printed",
  noRunYet:
    "Home hasn't run this program yet. What rustc does with it shows here once it has.",
  noRun:
    "Home couldn't run this program, so there's nothing from rustc to show.",
  /** The look over. */
  ticketLabel: (id: string, title: string): string => `${id} · ${title}`,
  send: (n: number): string => `Send to home · ${answers(n)}`,
  needs: {
    nothing: "Say one ticket at least to send the week.",
    closed:
      "The week closed at its deadline, so these takes can't count. They stay on this phone.",
  },
  /** Why the week is kept rather than sent, where home is out of reach. */
  notNear: {
    away: "Home is out of reach. The takes are kept here and go home when you're back in reach.",
    unpaired:
      "This phone isn't paired with home yet. The takes are kept here and go home once it is.",
    unknown: null,
  },
  /** After Send. */
  sent: {
    title: (n: number, of: number): string => `Sent home: ${n} of ${of}.`,
    line: "Home keeps your takes and writes down the words it hears in them. Nothing answers now. The essay comes after the deadline, and covers every ticket, answered or not.",
    heard: "What home heard",
    hearing: "Home is hearing it.",
    /** Not asked this opening, or home doesn't hold it or couldn't say. */
    later:
      "Its words show here once home has heard it, the next time you open the week.",
    noWords: "Home heard no words in it.",
    notAnswered: "Not answered.",
  },
  card: CARD_WORDS,
  /** The cards from before the weeks, until RR20 retires them. */
  rounds: "The rounds from before",
} as const
