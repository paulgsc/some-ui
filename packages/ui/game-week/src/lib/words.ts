/**
 * Every word the recorder says about itself, in one pure table (CLAUDE.md,
 * "State in the person's terms"): what is kept where, and since when, never
 * the machinery behind it. `__tests__/words.test.ts` holds every entry and
 * every phrase these functions can make to that.
 */
import { counted, dayOf, formatDay } from "@some-ui/core-utils"

import type { ModeId } from "./modes"
import type { OutboxView } from "./ports"

export const WORDS = {
  team: "SF",
  pickGame: "Game",
  watching: "Watching",
  notWatching: "Not watching",
  everyScenario: "Every scenario",
  noOffer:
    "Nothing offered for this game yet: say it first, or pick from every scenario. Your bites wait on this phone.",
  noGames:
    "Recording opens once home sends this week's games. Until then, every scenario is listed under Every scenario.",
  likeliest: "Likeliest now",
  alsoNow: "Could also be",
  justHappened: "Just happened",
  sayItFirst: "Say it first",
  sayItFirstHint: "Talk now, say what it was about after.",
  done: "Done",
  quietBar: "Stops when you go quiet",
  askTitle: "What was that about?",
  later: "Later: home works it out from what I said",
  undo: "Undo",
  settingsTitle: "How much to show",
  legendTitle: "Every scenario",
  legendLede: "Tap one to talk about it.",
  recordingLabel: "Saying it",
  sayingFirst: "Saying it first",
} as const

export const NOTICES = {
  tooShort: "Too short to keep. Tap, talk, then tap Done.",
  notTaken: "That one couldn't be kept. Try again?",
  notKept:
    "That bite couldn't be kept on this phone yet. The app holds it and keeps trying while it's open.",
  thrownAway: "Thrown away. Nothing kept.",
  tooLateToUndo: "Too late to undo: that bite is on its way home.",
  notNoted:
    "Couldn't note what that was about. Home works it out from what you said.",
  keptNow: "That bite is kept on this phone now.",
  askClosed: "Noted as Later: home works it out from what you said.",
  tooLateToNote:
    "Too late to note what that was about: that bite is on its way home as Later.",
  pickFirst: "Pick a game first.",
  notStarted: "The screen went away before the microphone opened.",
} as const

/** What a kept bite's toast says. */
export function keptLine(durationMs: number): string {
  return `Kept, ${seconds(durationMs)}.`
}

/** `ms` as whole seconds, "4 s". */
function seconds(ms: number): string {
  return `${Math.max(0, Math.round(ms / 1000))} s`
}

/** A bite's elapsed time, "0:07". */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const s = total % 60
  return `${Math.floor(total / 60)}:${s < 10 ? "0" : ""}${s}`
}

/** How long ago something happened, "40 s ago", "2 min ago". */
export function ago(ms: number): string {
  if (ms < 60_000) return `${seconds(ms)} ago`
  return `${Math.floor(ms / 60_000)} min ago`
}

export const MODE_WORDS: Readonly<
  Record<ModeId, { name: string; lede: string; rows: ReadonlyArray<string> }>
> = {
  light: {
    name: "Light",
    lede: "The fewest cards, for a game you half watch.",
    rows: [
      "2 cards",
      "1 just happened, shown for a minute",
      "Pregame from an hour before kickoff",
      "Stops after 2 s of quiet",
    ],
  },
  standard: {
    name: "Standard (recommended)",
    lede: "Enough to keep up without hunting.",
    rows: [
      "4 cards",
      "2 just happened, shown for 90 s",
      "Pregame from 3 hours before kickoff",
      "Stops after 2 s of quiet",
    ],
  },
  full: {
    name: "Full",
    lede: "Everything, for a game you live in.",
    rows: [
      "6 cards",
      "3 just happened, shown for 3 minutes",
      "Pregame from 8 AM on game day",
      "Stops after 3 s of quiet",
    ],
  },
}

/** Every mode stops a bite at one minute. */
export const MINUTE_LINE = "Every bite stops at one minute."

/**
 * What the outbox line under the screen says, or "" when nothing waits and
 * home holds none.
 */
export function outboxLine(view: OutboxView): string {
  const lines: Array<string> = []
  if (view.notKept > 0) {
    lines.push(
      view.notKept === 1
        ? "1 bite couldn't be kept on this phone yet. The app keeps trying while it's open."
        : `${view.notKept} bites couldn't be kept on this phone yet. The app keeps trying while it's open.`
    )
  }
  if (view.waiting > 0) {
    const bites =
      view.waiting === 1 ? "1 bite waits" : `${view.waiting} bites wait`
    lines.push(
      view.sending
        ? `${bites} on this phone until home has ${view.waiting === 1 ? "it" : "them"}.`
        : `${bites} on this phone. They go home once you keep voice notes on home, in Settings.`
    )
  }
  if (view.refused > 0) {
    lines.push(
      view.refused === 1
        ? "Home couldn't take 1 bite. It stays on this phone."
        : `Home couldn't take ${view.refused} bites. They stay on this phone.`
    )
  }
  if (view.onHome !== null) {
    const { count, since } = view.onHome
    lines.push(
      `${counted(count, "bite")} kept on home since ${formatDay(dayOf(new Date(since)))}.`
    )
  }
  return lines.join(" ")
}
