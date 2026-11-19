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
import type { FlowStepKind, Standing } from "@rust-rounds/lib/flow"
import type { Week } from "@rust-rounds/lib/formats/week"
import { formatTimecode } from "@some-ui/core-utils"
import type { BundleWords, TeleprompterWords } from "@some-ui/shared"
import type { TakeWords } from "@some-ui/voice-capture"
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
export type TicketStanding =
  | "open"
  | "said"
  | "sent"
  /** Sent before, and said again since, on this phone (RR22). */
  | "resaid"
  | "unanswered"

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
    sent: "Sent",
    resaid: "Said again, on this phone until you send",
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
  /** A ticket answered point by point (RR24): its card's own words. */
  points: {
    heading: "Speak to each point",
    /** The filter's label, for assistive tech. */
    filter: "Points",
    all: "All",
    unsaid: "Unsaid",
    said: "Said",
    asked: "As asked",
    unsaidFirst: "Unsaid first",
    /** A point with no take; RR29 (#3257) words it "Going with the recommended". */
    notSaid: "Not said",
    inWhole: "In the whole take",
    /** A point's line, folded: its number, for assistive tech. */
    open: (n: number, to: string): string => `Point ${n}: ${to}`,
    whole: "One take for the whole ticket",
    wholeLine:
      "Recorded before takes went point by point. Home weighs it as one take for the whole ticket, as before.",
    count: (said: number, of: number): string =>
      `${said} of ${of} ${of === 1 ? "point" : "points"} said · all on this phone until you send`,
    pointOf: (n: number, of: number): string => `Point ${n} of ${of}`,
    others: (n: number): string => `${n} other ${n === 1 ? "point" : "points"}`,
    opensAgain: "Opens again when you stop",
    /** A point's name in the look over and once sent. */
    label: (ticket: string, n: number, to: string): string =>
      `${ticket} · ${n}. ${to}`,
  },
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
  /** Send, once the week went home before (RR22). */
  sendAgain: (n: number): string => `Send again · ${answers(n)}`,
  needs: {
    nothing: "Say one ticket at least to send the week.",
    unchanged:
      "Home already holds the week as it is. Say a ticket, or say one again, to send it again.",
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
  /** Over the brief, once the week was sent and while it is open (RR22). */
  held: (n: number, of: number, at: string): string =>
    `Home has your send from ${weekday(at)} ${clock(at)}: ${n} of ${of} answered.`,
  /** Sent from this phone, and home hasn't had it yet. */
  goesHome: (n: number, of: number, at: string): string =>
    `Your send from ${weekday(at)} ${clock(at)}, ${n} of ${of} answered, is on this phone. It goes home when you're in reach.`,
  openUntil: (week: Pick<Week, "due">): string =>
    `What home has at ${weekday(week.due)} ${clock(week.due)} is what counts, and is kept for good. Until then you can answer any ticket, say one again and send the week again.`,
  backToWeek: "Back to the week",
  /** A ticket's card, for its take home holds. */
  home: {
    holds: "This is the take you sent for this ticket.",
    again:
      "You sent an earlier take for this ticket. The one here goes when you send again.",
  },
  /** After Send. */
  sent: {
    title: (n: number, of: number): string => `Sent home: ${n} of ${of}.`,
    line: "Home keeps your takes and writes down the words it hears in them. Nothing answers now. The essay comes after the deadline, and covers every ticket, answered or not.",
    again: (week: Pick<Week, "due">): string =>
      `What home has at ${weekday(week.due)} ${clock(week.due)} is what counts. Until then you can still answer, say a ticket again and send again.`,
    heard: "What home heard",
    hearing: "Home is hearing it.",
    /** Not asked this opening, or home doesn't hold it or couldn't say. */
    later:
      "Its words show here once home has heard it, the next time you open the week.",
    noWords: "Home heard no words in it.",
    notAnswered: "Not answered.",
  },
  /** The week read back once it closed (RR22): nothing records or sends. */
  closed: {
    title: (week: Pick<Week, "id">): string =>
      `Week ${weekNumber(week.id)} has closed.`,
    line: (week: Pick<Week, "due">): string =>
      `It closed ${weekday(week.due)} ${clock(week.due)}. What home had then is what counts, kept for good, and the essay comes from home. Nothing more can be said or sent here.`,
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
    unplayable: "This take isn't on this phone to play.",
  },
  card: CARD_WORDS,
  /** An error pasted from your own code, and a note on it. */
  paste: {
    open: "Paste an error",
    heading: "An error from your own code",
    line: "Paste rustc's output as it printed it. Next week's exercise can be built from it.",
    label: "Paste it as rustc printed it",
    left: (n: number): string => `${n} characters left`,
    say: "Say what you make of it, if you like.",
    where:
      "Kept on this phone as you type it. Nothing leaves before you keep it.",
    keep: "Keep it",
    back: "Back to the week",
    deleteNote: {
      title: "Delete this note?",
      line: "Your note on the paste hasn't left this phone, so deleting it removes it for good. You can say it again.",
    },
    kept: "Kept on this phone. A note on it goes home with your other takes; the error itself stays here until home keeps the week's record.",
    notKept:
      "This phone couldn't keep the paste, so nothing went. It's all still here.",
    draftNotKept:
      "This phone couldn't keep that change to the paste, so it would be lost if you left now.",
  },
  /**
   * A ticket's flow (RR25, #3249; RR29, #3257; the owner's approved
   * prototype, C690): read, the academy, then voice, each a page of one
   * pager over the week. The owner's rule holds here too (C711, the
   * owner's): a step worked through is ticked "✓" beside its name, never
   * "done".
   */
  flow: {
    /** What PageControls pages, for assistive tech. */
    paged: "steps",
    /** Between the parts of one line: "Exercise 1 · builds toward forks 1 · 2". */
    dot: " · ",
    /** The step row. */
    steps: {
      read: "Read",
      academy: "Academy",
      voice: "Voice",
      opening: "Your opening",
    } satisfies Record<FlowStepKind, string>,
    stepsOf: (ticket: string): string => `Steps of ${ticket}`,
    standing: {
      /** Beside the step's name: "Read ✓". */
      done: "✓",
      skipped: "Skipped",
      open: "",
    } satisfies Record<Standing, string>,
    /** What a screen reader says for the tick. */
    doneSaid: "worked through",
    /** The academy's standing in the step row: exercises worked at the desk. */
    atDesk: (n: number, of: number): string => `${n} of ${of} worked`,
    notKept:
      "This phone couldn't keep that, so it would be lost if you left now.",
    read: {
      meet: "What it has to meet",
      forks: "The agent's recommendations",
      forkOf: (n: number, of: number): string => `Fork ${n} of ${of}`,
      notAll: (k: number): string =>
        `${k} options. Not every option is listed, and the recommended one isn't always best.`,
      recommended: "Recommended",
      restsOn: "Rests on:",
      cites: "Trades on:",
      toAcademy: "On to the academy",
      toDecisions: "On to your decisions",
      toVoice: "On to voice",
      skip: "Skip to your decisions",
    },
    academy: {
      line: "Before you decide, test the models the options rest on, at your desk. Stumbling here is the point.",
      head: (n: number, forks: string): string =>
        `Exercise ${n} · builds toward forks ${forks}`,
      tests: (which: string): string => `Tests ${which}`,
      /** One option an exercise tests: "fork 1's option B". */
      option: (fork: number, option: string): string =>
        `fork ${fork}'s option ${option}`,
      /** Between the options an exercise tests. */
      and: " and ",
      atDesk: "Worked at your desk",
      notYet: "Not yet",
      onward: "On to your decisions",
      skip: "Skip to your decisions",
    },
    exercise: {
      back: "The academy",
      head: (ticket: string, n: number, of: number): string =>
        `${ticket} · Exercise ${n} of ${of}`,
      toward: (forks: string): string => `builds toward forks ${forks}`,
      tests: (fork: number, option: string): string =>
        `Tests the model behind fork ${fork}'s option ${option}`,
      words: "Words it works on",
      then: "Then",
      clarity: "Questions to have clarity on",
      tick: "I did this at my desk",
      ticked: "Worked at your desk",
    },
    voice: {
      line: 'At each fork, pick an option or say your own, then say why. "I\'m trusting the agent" is a reason too. A fork you leave alone goes with the recommended.',
      heading: "Your decisions",
      recommended: "Recommended",
      own: "Something else: say it",
      none: "Going with the recommended",
      pick: (option: string): string => `Your pick: ${option}`,
      ownPick: "Your own option",
      byDefault: (option: string): string =>
        `Going with the recommended · ${option}`,
      said: "said",
      notSaid: "not said yet",
      mine: (n: number, of: number): string =>
        `${n} of ${of} ${of === 1 ? "fork" : "forks"} decided by you · the rest go with the recommended · all on this phone until you send`,
      next: (ticket: string): string => `On to ${ticket}`,
    },
    /**
     * The essay's opening (#3269): someone new to Rust Rounds asks, the
     * owner reads an answer through the teleprompter, one question a page.
     * With a take in place the page says which, from when and how long,
     * and offers to use it or record again (the owner, 2026-11-19). A
     * recording ends with "Stop"; nothing here says a step is over.
     */
    opening: {
      kicker: "Before the tickets",
      /** On the brief, under the opening's name. */
      questions: (n: number): string =>
        `${n === 1 ? "1 question" : `${n} questions`} someone new asks you, before the tickets`,
      /** In the look over: "Your opening, question 1: What is Rust Rounds…". */
      label: (n: number, ask: string): string =>
        `Your opening, question ${n}: ${ask}`,
      title: "Your essay's opening",
      questionOf: (n: number, of: number): string => `Question ${n} of ${of}`,
      line: "Someone who has never heard of Rust Rounds asks you this. Read your answer aloud. Next Monday's essay opens on the conversation: their voice asks, yours answers.",
      theyAsk: "They ask",
      script: "Your answer",
      /** Where the question's take stands. */
      unknown:
        "Not known yet: home hasn't said which take of this answer the essay plays. You can still record one.",
      none: "No take of this answer yet. Read it aloud to record one.",
      inPlace: "The take the essay plays",
      /** Home's take: "Recorded 12 Nov, 9:40 PM, in week 46 · 0:24". */
      fromHome: (when: string, week: string, ms: number | null): string =>
        [
          `Recorded ${when}, in week ${weekNumber(week)}`,
          ...(ms === null ? [] : [formatTimecode(ms)]),
        ].join(" · "),
      onHome: "Kept on home",
      /** A take said this week, under the take's own row. */
      here: "Recorded this week. It stays on this phone until you send the week, then plays from home.",
      play: "Play",
      stop: "Stop",
      asking: "Asking home for it…",
      missed: "Home couldn't give it to this phone just now.",
      playAgain: "Play again",
      use: "Use this one",
      again: "Record again",
      keepsEarlier:
        "Recording again keeps this one on home. The essay plays the newest.",
      notThisWeek: "Not this week",
      band: {
        waiting: "Moves once it hears you. You can scroll it yourself too.",
        moving: "Moves while you speak",
        holding: "Holding until you speak",
        paused: "Paused. The take is still recording.",
      } satisfies TeleprompterWords["band"],
      ready: "Read it aloud once you start recording.",
      pause: "Pause",
      goOn: "Go on",
      slower: "Slower",
      faster: "Faster",
      pace: (wpm: number): string => `About ${wpm} words a minute`,
      time: (ms: number): string => formatTimecode(ms),
    },
  },
  /** The cards from before the weeks, until RR20 retires them. */
  rounds: "The rounds from before",
} as const

/**
 * A take of the opening's answer, said its way (#3269): the button records
 * "Record your answer" and ends with "Stop", and a take's Redo records it
 * again, keeping the earlier one.
 */
export const OPENING_TAKE_WORDS: TakeWords = {
  ...TAKE_WORDS,
  button: {
    ...TAKE_WORDS.button,
    ready: "Record your answer",
    again: "Record again",
    recording: "Stop",
  },
  buttonLabel: {
    ...TAKE_WORDS.buttonLabel,
    ready: "Record your answer",
    again: "Record your answer again",
    recording: "Stop, and keep it",
  },
  redo: "Record again",
}
