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
  pacificClock as clock,
  pacificWeekday as weekday,
  weekNumber,
} from "@some-ui/core-utils"
import type { InterviewWeek, WorkSource } from "@some-ui/interview-week"
import { TAKE_MAX_SECONDS, workSourceKey } from "@some-ui/interview-week"
import type { BundleWords } from "@some-ui/shared"
import { TAKE_WORDS } from "@some-ui/voice-capture"

import { FEED_WORDS } from "@/lib/call-videos/words"
import { lengthOf } from "@/lib/format"

import type { Rung, Step } from "./ladder"

const takes = (n: number): string => (n === 1 ? "1 take" : `${n} takes`)

/**
 * Where the week's takes are kept, said on the Interview page and the look
 * over. A first take goes home as a copy kept for good (owner, 2026-11-17, on
 * retakes); only the send home has by the deadline counts (IWC1).
 */
const KEPT =
  "Your first take of each question goes home on its own and is kept for good, but counts only if you send it. The rest stay on this phone until you send the week."

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
  // The swiped cards' line; the interview's pages draw no row of cards.
  saidCount: (n, of) => `${n} of ${of} said`,
  toReview: "Look it over before sending",
  review: {
    kept: KEPT,
    playAll: "Play all, in order",
    stopAll: "Stop",
    // Only what is still on this phone goes; "all" read as the takes kept for good too.
    deleteAll: "Delete from this phone",
    notSaid:
      "Not said. Send the week without it and home has it as passed over.",
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
    allTitle: "Delete the takes still on this phone?",
    allLine:
      "Every take that hasn't left this phone is removed for good. Any that already went home stay.",
    yes: "Delete for good",
    keep: "Keep it",
  },
  notice: {
    deleted: TAKE_WORDS.discarded,
    deletedAll: TAKE_WORDS.discarded,
    notKept:
      "This phone couldn't keep that change, so it would be lost if you left now.",
    notSent:
      "This phone couldn't keep the week's takes as sent, so the send didn't go. The takes are all still here.",
    notDeleted: "That couldn't be deleted, so it's still here.",
  },
}

/** A claim's source, as its chip names it: its key's name, `some-ui#3170`, `C266`, a doc's path. */
function sourceName(source: WorkSource): string {
  const key = workSourceKey(source)
  return key.slice(key.indexOf(":") + 1)
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
  // Its own name, apart from the ladder's "Read it aloud" and the phone's Read aloud.
  reads: "Scripts",
  readsLine:
    "Short scripts about why a piece of this work exists, read as written, the way you'd open a talk.",
  /** The Interview page, the way in (IW15): what this is, each kind and its time. */
  wayIn: {
    title: "A practice interview, once a week",
    line: (title: string, company: string): string =>
      `For an invented job: ${title} at ${company}. You answer aloud, your takes go to home, your own computer, and once the week closes home makes a video essay of how you came across.`,
    kinds: "Two kinds of practice",
    anyOrder: "Do one kind or both, in any order, on any day this week.",
    questions: {
      what: "Answer in your own words",
      cost: (n: number, seconds: number): string =>
        `${n === 1 ? "1 question" : `${n} questions`} · about ${lengthOf(seconds * 1000)} each`,
    },
    reads: {
      what: "Read a short script as written",
      cost: (n: number, seconds: number): string =>
        `${n === 1 ? "1 script" : `${n} scripts`} · about ${lengthOf(seconds * 1000)} each`,
    },
    how: "How a week goes",
    takes: "Hear your takes",
    takesLine: "In Studio's Takes, with your other recordings",
    /** The week's name on Takes' chip: "Week 47". */
    weekName: (week: Pick<InterviewWeek, "id">): string =>
      `Week ${weekNumber(week.id)}`,
    howLine: "Where your takes go, and when the essay comes",
    /** A week under way (IW16): what was done, each take where it is. */
    soFar: "So far this week",
    todayIs: (prompt: string): string => `Today: ${prompt}`,
  },
  /** How a week goes (IW15): home named once, as the owner's own computer. */
  how: {
    title: "How a week goes",
    steps: [
      {
        name: "Each Monday, a new week",
        line: "An invented company and job, a few questions and a few short scripts. No real employer is named.",
      },
      {
        name: "You speak, on this phone",
        line: `Tap to record and tap again to stop. A take stops at ${lengthOf(TAKE_MAX_SECONDS * 1000)}. Say one again whenever you like; the newest is the one you send.`,
      },
      {
        name: "Your takes go home",
        line: `Home is your own computer. ${KEPT}`,
      },
      {
        name: "Then, a video essay",
        line: "Once the week closes, home makes a video of how you came across: how each answer was built, the ums, the long pauses.",
      },
    ],
  },
  /** The Questions page (IW15): the week's questions, today's first. */
  questionsLine:
    "The questions an interviewer asks about you, answered for this role. Each has steps: read a ready answer, read it aloud, say it from cues, say it your way.",
  /** Today's question, by the number the look over gives it: "Today's question · Question 2". */
  today: (label: string): string => `Today's question · ${label}`,
  todayLine: "A minute or two, at whatever step you like",
  others: "The rest of the week's questions",
  toQuestions: "Questions",
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
  notInWeek: "This isn't in this week's interview.",
  /** The study page. */
  study: {
    work: "Every claim names where it comes from in your own work. Each source was checked at this week's commit.",
    open: "Built on the shape that works for this kind of question, fitted to you.",
    ready: "A ready answer",
    another: "Another good answer",
    poor: "A poor answer",
  },
  /** A claim's source, as its chip names it. */
  source: sourceName,
  /** A card's target length, and the cap on a take. */
  aim: (seconds: number): string => `Aim for about ${lengthOf(seconds * 1000)}`,
  cap: `A take stops at ${lengthOf(TAKE_MAX_SECONDS * 1000)}.`,
  guidelines: "What to cover",
  situation: "Where this is read",
  /** The week's opening card (IW10): the essay's opening, read in the owner's voice. */
  opening: "The essay's opening, in your voice",
  script: "Read this",
  /** The band a script is read aloud through (IW9): what it does now, its button, and the take's time against the aim. */
  band: {
    ready: "Moves while you speak",
    waiting: "Moves once it hears you. You can scroll it yourself too.",
    moving: "Moves while you speak",
    holding: "Holding while you pause",
    paused: "Paused. Tap Go on to go on.",
    pause: "Pause",
    goOn: "Go on",
    time: (elapsedMs: number, seconds: number): string =>
      `${lengthOf(elapsedMs)} / about ${lengthOf(seconds * 1000)}`,
  },
  /** Under the script while the cue counts; the button says how long is left. */
  cueLine: "Tap the button again to call it off.",
  /** The look over's names for a card. */
  questionLabel: (n: number): string => `Question ${n}`,
  readLabel: (n: number): string => `Script ${n}`,
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
    `The send home has by ${weekday(week.due)} ${clock(week.due)} is what counts, and is kept for good. Until then you can say any card, say one again and send the week again.`,
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
  /** Past weeks (IW17): each closed week on this phone, and where its essay is. */
  weeks: {
    title: "Past weeks",
    line: "Each week on this phone that has closed, and where its essay is.",
    entryLine: "Each closed week, and where its essay is",
    none: "No week on this phone has closed yet. Once one does, it shows here with its essay.",
    sent: (n: number, at: string): string =>
      `You sent it ${weekday(at)} ${clock(at)}: ${takes(n)}.`,
    noSend: "No send from this phone.",
    essay: {
      asking: "Asking home about its essay…",
      unpaired: "Pair this phone with home to see where its essay is.",
      older: FEED_WORDS["interview-essay"].older,
      unknown:
        "Home couldn't be asked just now, so where its essay is can't be said here.",
      ready: "Its essay is ready.",
      watch: "Watch its essay",
      making: "Home is making its essay's video now.",
      waiting:
        "Its essay is written, and its video waits at home for its turn.",
      written:
        "Its essay is written. Its video isn't made, and Renders shows what home is making.",
      failed: "Home couldn't finish its essay's video. Renders says why.",
      renders: "Open Renders",
      expected: "Home lists no essay of it.",
    },
    tryAgain: "Ask home again",
  },
  /** The week read back once it closed: nothing records or sends. */
  closed: {
    title: (week: Pick<InterviewWeek, "id">): string =>
      `Week ${weekNumber(week.id)} has closed.`,
    line: (week: Pick<InterviewWeek, "due">): string =>
      `It closed ${weekday(week.due)} ${clock(week.due)}. The send home had then is what counts, kept for good, and the essay comes from home. Nothing more can be said or sent here.`,
    held: (n: number): string =>
      `The send home had at the deadline: ${takes(n)}.`,
    noSend: "Home had no send from you at the deadline.",
    /**
     * A send made on this phone that home's record hasn't spoken of this
     * opening (RR30): home couldn't be asked, or didn't answer.
     */
    unheard: (at: string): string =>
      `Your send from ${weekday(at)} ${clock(at)} is shown below. This phone hasn't read home's record of the week, so it can't say what counted.`,
    /**
     * Home's record names a send this phone didn't keep (another device's);
     * `mine`, this phone's own last send, shown below, if it kept one.
     */
    elsewhere: (at: string, mine: string | null): string =>
      `Home holds a send from ${weekday(at)} ${clock(at)} that isn't on this phone, so its takes can't be shown here.${mine === null ? "" : ` Your send from ${weekday(mine)} ${clock(mine)} is shown below.`}`,
    /** A send made on this phone that home's record says it didn't have by the deadline. */
    late: (at: string): string =>
      `Your send from ${weekday(at)} ${clock(at)} didn't reach home before the deadline, so it doesn't count. It stays on this phone.`,
  },
} as const
