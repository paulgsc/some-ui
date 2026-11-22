/**
 * Every word the Cooking page says (`routes/_dashboard/_lan/cooking.tsx`),
 * in the owner's terms: who holds each stop, what it waits on, and since
 * when. `./__tests__/words.test.ts` holds that none names the machinery
 * (CLAUDE.md, "State in the person's terms").
 */
import type { Lands, Phase } from "@some-ui/video-render"

import type { Urgency } from "./algebra"
import type { Holder } from "./model"

export const COOKING_WORDS = {
  title: "Cooking",
  intro:
    "What I'm working on, as trains on their way to what you want: each stop is something that has to happen first, and says who it waits on.",
  reading: "Reading where everything stands…",
  away: "Where things stand couldn't be read. Try again in a moment.",
  stale:
    "Where things stand couldn't be read again, so this is what was read before.",
  noRun: "Nothing is cooking today: no run is open.",
  noGoals: "Today's run has no goals yet.",
  someUnread: (n: number): string =>
    `${n === 1 ? "One thing" : `${String(n)} things`} on GitHub couldn't be read just now, so the stops that needed ${n === 1 ? "it" : "them"} show as not reached yet. Read again in a few minutes.`,
  readingAgain: "Reading…",
  readAgain: "Read again",
  unreadRun:
    "Today's run can't be read here. Its page on GitHub says what it holds.",
  runPage: "Today's run on GitHub",
  tryAgain: "Try again",
  unread: "Not read just now",
  holder: {
    you: "You",
    claude: "Claude",
    checks: "Checks",
    home: "Home",
  } satisfies Record<Holder, string>,
  arrives: "Arrives",
  urgency: {
    now: "Now",
    today: "Today",
    whenever: "When you like",
  } satisfies Record<Urgency, string>,
  lands: {
    home: "Home",
    phone: "Your phone",
    site: "The public site",
    code: "The code",
  } satisfies Record<Lands, string>,
  phase: {
    briefed: "Told what to do",
    reaching: "Looking for what already does it",
    prototyping: "Drawing it for you to pick",
    building: "Building it",
    settling: "Reviewing and fixing it",
    ready: "Ready to be checked",
    admitted: "Being checked",
    stopped: "Stopped",
  } satisfies Record<Phase, string>,
  now: {
    merged: "Merged",
    closed: "Closed without merging",
    checkFailed: (n: number): string =>
      n === 1
        ? "A check failed, and Claude is on it"
        : `${String(n)} checks failed, and Claude is on them`,
    checksNotStarted: "Its checks haven't started",
    waitingForRunner: "Waiting its turn to start",
    checksRunning: (done: number, of: number): string =>
      `Checks running: ${String(done)} of ${String(of)} done`,
    readyToMerge: "Checks passed; waiting to be merged",
    approve: "Waiting for your approval",
    running: "Running",
    runFailed: "It failed, and Claude is on it",
    done: "Done",
    yours: "Yours to do",
    home: "Home does this on its own",
    arrived: "Arrived",
    notYet: "Not there yet",
  },
  log: {
    opened: "Opened",
    merged: "Merged",
    started: "Started",
    finished: "Finished",
    asked: "Asked you",
    youDone: "You marked it done",
    homeDone: "Home did it",
  },
  stepOf: (step: number): string => `Step ${String(step + 1)} of the ask`,
  yourCall: "Your decision",
  waitsOn: (title: string): string => `${title} arrives`,
  // the bar
  waitOnYou: (n: number): string =>
    n === 1 ? "1 waits on you" : `${String(n)} wait on you`,
  allMoving: "All moving",
  barYours: (
    urgency: string,
    what: string,
    waiting: ReadonlyArray<string>
  ): string =>
    `${urgency}: ${what}.${
      waiting.length === 0
        ? ""
        : ` ${waiting.join(" and ")} ${waiting.length === 1 ? "waits" : "wait"} on it.`
    }`,
  barOthers: (holder: string, what: string, title: string): string =>
    `Most urgent: ${holder}, ${what}, for ${title}.`,
  nothingOnYou: "Nothing waits on you.",
  allArrived: "Every train has arrived.",
  show: "Show",
  // the card
  stopOf: (title: string, at: number, of: number): string =>
    `${title} · stop ${String(at + 1)} of ${String(of)}`,
  passed: (since: string | null): string =>
    since === null ? "Done" : `Done, ${since}`,
  here: (since: string | null): string =>
    since === null ? "Here now" : `Here now, since ${since}`,
  ahead: "Not reached yet",
  previous: "Previous stop",
  next: "Next stop",
  page: "Its page on GitHub",
  goTo: (title: string): string => `Go to the ${title} train`,
  logTitle: "What happened here, newest first",
  overview: (n: number): string => `All ${String(n)} trains at a glance`,
  // the list
  showAndOrder: "Show and order the trains",
  showLabel: "Show",
  orderLabel: "Order",
  filters: {
    all: "All",
    you: "Waiting on you",
    moving: "Moving without you",
  },
  sorts: {
    "you-first": "Yours first",
    waiting: "Waiting longest",
    near: "Nearest arrival",
  },
  landsOn: (lands: string): string =>
    `Lands on ${lands.toLowerCase()} · pick any stop to see it above`,
  none: "No train here right now.",
  trainsOf: (from: number, to: number, of: number): string =>
    `Trains ${String(from)} to ${String(to)} of ${String(of)}`,
  previousPage: "Previous page",
  nextPage: "Next page",
  overCap: (max: number, n: number): string =>
    `${String(n)} trains are running, more than the ${String(max)} this page shows. One of them is probably a stop on another train.`,
} as const
