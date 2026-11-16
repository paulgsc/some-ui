/**
 * Every word the interview week's screen puts on the phone (IW5), in one pure
 * table, held to the owner's rules by `__tests__/words.test.ts`: no score,
 * grade, verdict or "you said", nothing that calls an answer good or bad, and
 * no status code or internal name. Nothing answers a take: the essay comes
 * from home after the deadline. The interview is invented (owner,
 * 2026-11-13), so the brief says to answer for its role.
 *
 * The cards' and the look over's words are the shared bundle's parts'
 * (`@some-ui/shared`'s `BundleWords`), filled in here; a take's own are the
 * take pattern's.
 */
import { PACIFIC_TIME_ZONE } from "@some-ui/core-utils"
import type { InterviewWeek } from "@some-ui/interview-week"
import type { BundleWords } from "@some-ui/shared"
import { TAKE_WORDS } from "@some-ui/voice-capture"

/** The day of the week of `at`, on the owner's clock. */
const weekday = (at: string): string =>
  new Date(at).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: PACIFIC_TIME_ZONE,
  })

/** The time of day of `at`, on the owner's clock: 23:59. */
const clock = (at: string): string =>
  new Date(at).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: PACIFIC_TIME_ZONE,
  })

/** The week's number, from its id: `2026-w47` is 47. */
const weekNumber = (id: string): number => Number(id.slice(id.indexOf("w") + 1))

const takes = (n: number): string => (n === 1 ? "1 take" : `${n} takes`)

/** A length in seconds, as a card shows its target: "1 min 30 s". */
export const lengthOf = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes === 0) return `${rest} s`
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}

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

/** Where a card stands, on the brief. */
export type CardStanding = "open" | "said" | "sent" | "resaid"

type Dated = Pick<InterviewWeek, "id" | "due">

export const INTERVIEW_WORDS = {
  ...BUNDLE,
  /** The Jobs wing's view, beside Today, Scout and Record. */
  view: "Interview",
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
    "Each read shows its script, counts down, and records while the script stays on screen. Read it as written.",
  standing: {
    open: "Not said",
    said: "Said, on this phone",
    sent: "Sent",
    resaid: "Said again, on this phone until you send",
  } satisfies Record<CardStanding, string>,
  /** A card's target length, and the cap on a take. */
  aim: (seconds: number): string => `Aim for about ${lengthOf(seconds)}`,
  cap: "A take stops at 2 minutes.",
  toReviewOf: (n: number, of: number): string =>
    `Look it over before sending · ${n} of ${of}`,
  /** A question's card. */
  questionOf: (n: number, of: number): string => `Question ${n} of ${of}`,
  guidelines: "What to cover",
  /** A read's card. */
  readOf: (n: number, of: number): string => `Read ${n} of ${of}`,
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
  /** A card, for its take home holds. */
  home: {
    holds: "This is the take you sent for this card.",
    again:
      "You sent an earlier take for this card. The one here goes when you send again.",
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
