/**
 * Every word the work tracker and the week's time put on the phone (RR26,
 * paulgsc/some-ui#3250), in one pure table, held by
 * `__tests__/words.test.ts`.
 *
 * These are the one place in Rust Rounds that say how long: the owner asked
 * to see the time they put in (#3250) and approved these words in the flow
 * prototype (C690). The cards' and the week's own words still never count
 * time (`lib/play/__tests__/words.test.ts`). Like them, these hold no score
 * or verdict, no status code and no internal name: what is kept and where,
 * in the owner's terms.
 */
import type { WorkStep } from "@rust-rounds/lib/work-tracker"
import { pacificClock } from "@some-ui/core-utils"

/** `seconds` as the owner reads a length: `1 h 30 m`, `42 m`, `0 m`. */
export function hoursMinutes(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} m`
  return rest === 0
    ? `${hours} h`
    : `${hours} h ${String(rest).padStart(2, "0")} m`
}

/** `seconds` on a running clock: `0:42`, `1:05`. */
export function runningClock(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
}

/** A moment as the owner's clock shows it: `9:40`. */
const atClock = (at: number): string => pacificClock(new Date(at))

const STEP_NAMES: Readonly<Record<WorkStep, string>> = {
  read: "Reading",
  academy: "The academy",
  voice: "Voice",
}

export const TRACKER_WORDS = {
  idle: "Away from the phone? Track it.",
  start: "Start working",
  /** While home hasn't said whether you're working somewhere else. */
  unknown: "Checking whether you're working on another device…",
  running: (since: number, seconds: number): string =>
    `Working since ${atClock(since)} · ${runningClock(seconds)}`,
  back: "I'm back",
  sheet: {
    title: "Welcome back",
    started: (ticket: string, at: number): string =>
      `You started working on ${ticket} at ${atClock(at)}.`,
    stoppedItself: (cap: number, at: number): string =>
      `The tracker stopped itself at ${hoursMinutes(cap / 1000)}, at ${atClock(at)}.`,
    stoppedByYou: (at: number): string => `You came back at ${atClock(at)}.`,
    ask: "Were you working this whole time?",
    all: (seconds: number): string => `Yes, all ${hoursMinutes(seconds)}`,
    partLabel: "Part of it:",
    less: "15 minutes less",
    more: "15 minutes more",
    part: (minutes: number): string => `Count ${hoursMinutes(minutes * 60)}`,
    none: "No, don't count it",
    notKept:
      "Your answer wasn't kept on this phone. Nothing is lost: answer again.",
  },
  counted: (
    ticket: string,
    seconds: number,
    from: number,
    to: number
  ): string =>
    seconds === 0
      ? `Nothing counted on ${ticket}, ${atClock(from)} to ${atClock(to)}.`
      : `Counted ${hoursMinutes(seconds)} at your desk on ${ticket}, ${atClock(from)} to ${atClock(to)}.`,
  notStarted:
    "This phone couldn't keep the start, so nothing is running. Free some room and try again.",
  dismiss: "Close",
  week: {
    title: "Your time this week",
    total: (seconds: number, answered: number): string =>
      answered === 0
        ? "Nothing tracked yet this week"
        : `${hoursMinutes(seconds)} at your desk · ${answered === 1 ? "1 stretch" : `${answered} stretches`}`,
    step: (step: WorkStep): string => STEP_NAMES[step],
    startedFrom: "Started from",
    bar: (ticket: string, step: WorkStep, seconds: number): string =>
      `${ticket} · ${STEP_NAMES[step]}: ${hoursMinutes(seconds)}`,
    ticketTotal: (seconds: number): string => hoursMinutes(seconds),
    asTable: "Show as a table",
    asBars: "Show as bars",
    ticket: "Ticket",
    all: "All",
    refused: (n: number): string =>
      `${n === 1 ? "1 stretch overlaps" : `${n} stretches overlap`} one home kept from another device, so ${n === 1 ? "it stays" : "they stay"} on this phone and out of the total.`,
    yours:
      "Only you see this. It's kept on your home, never on the public site.",
  },
} as const
