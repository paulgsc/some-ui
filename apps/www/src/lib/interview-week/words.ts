/**
 * Every word the interview week's pages put on the phone (IW5, IW8), in one
 * pure table, held to the owner's rules by `__tests__/words.test.ts`: no
 * score, grade, verdict or "you said", nothing that calls a take good or bad,
 * no count, nothing about what wasn't done, and no status code or internal
 * name. What was done reads in the past tense ("Read aloud on Monday"). The
 * study page's names for the ready answers it shows ("Another good answer",
 * "A poor answer") are about those answers, never a take (owner, 2026-11-17). Nothing answers a take: the essay comes
 * from home after the deadline. The interview is invented (owner,
 * 2026-11-13), so the brief says to answer for its role.
 *
 * The cards' and the look over's words are the shared bundle's parts'
 * (`@some-ui/shared`'s `BundleWords`), filled in here; a take's own are the
 * take pattern's. Many read as Rust Rounds' week's do (`@some-ui/rust-rounds`
 * `week-play/words.ts`); each product keeps its own copy, free to say its own
 * week in its own words.
 */
import {
  assertNever,
  pacificClock as clock,
  pacificWeekday as weekday,
  weekNumber,
} from "@some-ui/core-utils"
import type { InterviewWeek, WorkSource } from "@some-ui/interview-week"
import { TAKE_MAX_SECONDS } from "@some-ui/interview-week"
import type { BundleWords } from "@some-ui/shared"
import { TAKE_WORDS } from "@some-ui/voice-capture"

import { lengthOf } from "@/lib/format"

import type { Rung, Step } from "./ladder"

const takes = (n: number): string => (n === 1 ? "1 take" : `${n} takes`)

const BUNDLE: BundleWords = {
  dot: {
    said: (n) => `Card ${n}, said`,
    typed: (n) => `Card ${n}, said`,
    failed: (n) => `Card ${n}, your voice didn't come through`,
    full: (n) => `Card ${n}, no room to record it`,
    later: (n) => `Card ${n}, left for later`,
    open: (n) => `Card ${n}, not said yet`,
  },
  cardOf: (n, of) => `Card ${n} of ${of}`,
  prev: (n) => `← ${n}`,
  next: (n) => `${n} →`,
  last: "Last card",
  unsaid: () => "Tap once to start, and once more when you're done.",
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
    notSaid: "Not said. Sent as it is, it goes as passed over.",
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

/** A claim's source, as its chip names it: `some-ui#3170`, `C266`, a doc's path. */
function sourceName(source: WorkSource): string {
  switch (source.kind) {
    case "pull":
    case "issue": {
      return `${source.repo}#${source.number}`
    }
    case "call":
    case "invariant": {
      return source.id
    }
    case "doc": {
      return source.path
    }
    default: {
      return assertNever(source)
    }
  }
}

type Dated = Pick<InterviewWeek, "id" | "due">

export const INTERVIEW_WORDS = {
  ...BUNDLE,
  reading: "Opening the week…",
  unreadable:
    "What this phone keeps for the week couldn't be read, so nothing new can be kept yet.",
  readAgain: "Try again",
  back: "Back",
  /** While this phone holds no week from home. */
  none: {
    title: "No interview week on this phone yet",
    line: "Each Monday home writes a week: an invented company and role, a few questions to answer aloud, and a few short pieces to read aloud. It shows here once this phone has it from home.",
  },
  /** The brief's heading: "Week 47 · due Sunday 23:59". */
  heading: (week: Dated): string =>
    `Week ${weekNumber(week.id)} · due ${weekday(week.due)} ${clock(week.due)}`,
  role: (title: string, company: string): string => `${title} at ${company}`,
  invented:
    "The company and the role are invented. Answer as you would for this role.",
  questions: "Questions",
  reads: "Read aloud",
  readsLine:
    "Short scripts about why a piece of this work exists, read as written, the way you'd open a talk.",
  readsEntry:
    "Read aloud has its own page: short scripts about the work, read as written.",
  /** The Interview page (IW8). */
  today: "Today's question",
  todayLine: "A minute or two, at whatever step you like",
  others: "The week's other questions",
  kept: "Your first take of each question goes home on its own. The rest stay on this phone until you send the week.",
  /** What was done on each rung, and on a take said before rungs were kept. */
  past: {
    aloud: "Read aloud",
    cues: "Said from cues",
    own: "Said your way",
    said: "Said",
  } satisfies Record<Rung | "said", string>,
  /** What was last done with a question or a read, on its day: "Read aloud on Monday". */
  done: (did: string, at: string): string => `${did} on ${weekday(at)}`,
  /** A question's ladder (IW8): the agreed names (owner, 2026-11-17). */
  step: {
    study: {
      name: "Read the answer",
      line: "Two good answers and a poor one, with notes",
    },
    aloud: { name: "Read it aloud", line: "The answer, one phrase a line" },
    cues: { name: "Say it from cues", line: "A few words to lean on" },
    own: { name: "Say it your way", line: "Just the question" },
  } satisfies Record<Step, { name: string; line: string }>,
  yourTake: "Your take",
  inItsPlace: "Saying it again puts the new one here in its place.",
  toInterview: "Interview",
  toQuestion: "The question",
  toAnswer: "The answer",
  toReads: "Read aloud",
  notInWeek: "This isn't in this week's interview.",
  /** The study page. */
  study: {
    work: "Every claim names where it comes from in your own work. Each source was checked at this week's commit.",
    open: "Built on the shape that works for this kind of question, fitted to you.",
    ready: "A ready answer",
    another: "Another good answer",
    poor: "A poor answer",
    readIt: "Read it aloud",
  },
  /** A claim's source, as its chip names it. */
  source: sourceName,
  /** A card's target length, and the cap on a take. */
  aim: (seconds: number): string => `Aim for about ${lengthOf(seconds * 1000)}`,
  cap: `A take stops at ${lengthOf(TAKE_MAX_SECONDS * 1000)}.`,
  guidelines: "What to cover",
  situation: "Where this is read",
  script: "Read this",
  /** The count before a read records. */
  cue: (left: number): string => `Recording in ${left}`,
  cueLine: "Tap the button again to call it off.",
  /** The look over's names for a card. */
  questionLabel: (n: number): string => `Question ${n}`,
  readLabel: (n: number): string => `Read ${n}`,
  send: (n: number): string => `Send to home · ${takes(n)}`,
  sendAgain: (n: number): string => `Send again · ${takes(n)}`,
  needs: {
    nothing: "Say one card at least to send the week.",
    unchanged:
      "Home already holds the week as it is. Say a card, or say one again, to send it again.",
    closed:
      "The week closed at its deadline, so these takes can't count. They stay on this phone.",
  },
  notNear: {
    away: "Home is out of reach. The takes are kept here and go home when you're back in reach.",
    unpaired:
      "This phone isn't paired with home yet. The takes are kept here and go home once it is.",
    unknown: null,
  },
  /** Over the brief, once the week was sent and while it is open. */
  held: (n: number, at: string): string =>
    `Home has your send from ${weekday(at)} ${clock(at)}: ${takes(n)}.`,
  goesHome: (n: number, at: string): string =>
    `Your send from ${weekday(at)} ${clock(at)}, ${takes(n)}, is on this phone. It goes home when you're in reach.`,
  openUntil: (week: Pick<InterviewWeek, "due">): string =>
    `What home has at ${weekday(week.due)} ${clock(week.due)} is what counts, and is kept for good. Until then you can say any card, say one again and send the week again.`,
  backToWeek: "Back to the week",
  /** A take page, once the week was sent: whether the take there is the one home holds. */
  home: {
    holds: "This is the take you sent for this.",
    again:
      "You sent an earlier take for this. The one here goes when you send again.",
  },
  /** After Send. */
  sent: {
    title: (n: number): string => `Sent home: ${takes(n)}.`,
    line: "Home keeps your takes and writes down the words it hears in them. Nothing answers now. The essay comes after the deadline, and covers every card, said or not.",
    notSaid: "Not said.",
  },
  /** The week read back once it closed: nothing records or sends. */
  closed: {
    title: (week: Pick<InterviewWeek, "id">): string =>
      `Week ${weekNumber(week.id)} has closed.`,
    line: (week: Pick<InterviewWeek, "due">): string =>
      `It closed ${weekday(week.due)} ${clock(week.due)}. What home had then is what counts, kept for good, and the essay comes from home. Nothing more can be said or sent here.`,
    held: (n: number): string => `Home had ${takes(n)} at the deadline.`,
    late: (at: string): string =>
      `Your send from ${weekday(at)} ${clock(at)} didn't reach home before the deadline, so it doesn't count. It stays on this phone.`,
  },
} as const
