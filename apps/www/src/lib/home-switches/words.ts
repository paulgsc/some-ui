/**
 * Every word the home-switches page shows: what a switch does, how it
 * stands, who changed it and when, and why home's answer did not come.
 * Pure, and the one place those words live, so they stay in the person's
 * terms (what home does, since when, and who said so) and never the
 * machinery's: no address, request, status code, variable or stored name
 * reaches the screen (`__tests__/words.test.ts`).
 */
import { assertNever } from "@some-ui/core-utils"

import type {
  Refusal,
  SetBy,
  Standing,
  SwitchesState,
  SwitchKey,
} from "./model"

export const PAGE = {
  title: "Home's switches",
  intro:
    "What home does while it runs. Home keeps every change made here: what it became, who made it and when.",
  asking: "Asking home…",
  askAgain: "Ask again",
} as const

/** One switch's words: what it does, and how it says on and off. */
export type SwitchWords = {
  readonly label: string
  readonly about: string
  /** How it stands, at the start of the standing line. */
  readonly on: string
  readonly off: string
  /** What whoever changed it did. */
  readonly turnedOn: string
  readonly turnedOff: string
  /** While a change is on its way to home. */
  readonly turningOn: string
  readonly turningOff: string
  /** A change home did not confirm. */
  readonly unconfirmedOn: string
  readonly unconfirmedOff: string
}

export const RUST_ROUNDS: SwitchWords = {
  label: "Rust Rounds recording",
  about:
    "Home runs each program in your Rust Rounds and their weekly sets, in a sandbox, and keeps what the compiler printed. Paused, rounds and weeks are still kept, and their programs wait until recording is back on. Home looks at this switch each time it sets out to run programs, about once a minute, and finishes any run already under way first.",
  on: "On",
  off: "Paused",
  turnedOn: "turned it on",
  turnedOff: "paused it",
  turningOn: "Turning recording on…",
  turningOff: "Pausing recording…",
  unconfirmedOn: "Home didn't confirm recording is on.",
  unconfirmedOff: "Home didn't confirm recording is paused.",
}

export const GAME_FEED: SwitchWords = {
  label: "Following NFL games",
  about:
    "Home follows each NFL game this week as it's played, and keeps every play, so Game Day on your phone can show them live and what you said about them is matched to the play. Paused, home asks for no games and the phone says home isn't following games; every game and play already kept stays. Home looks at this switch each time it wakes to follow games, and finishes anything already under way first.",
  on: "Following",
  off: "Paused",
  turnedOn: "turned it on",
  turnedOff: "paused it",
  turningOn: "Turning following games on…",
  turningOff: "Pausing following games…",
  unconfirmedOn: "Home didn't confirm it is following games.",
  unconfirmedOff: "Home didn't confirm following games is paused.",
}

/** Each switch's words, by the switch. */
export const SWITCH_WORDS: Readonly<Record<SwitchKey, SwitchWords>> = {
  "rust-rounds": RUST_ROUNDS,
  "game-feed": GAME_FEED,
}

/** Who changed it, as the sentence's subject. */
function who(by: SetBy): string {
  switch (by) {
    case "owner": {
      return "you"
    }
    case "operator": {
      return "another account home trusts"
    }
    default: {
      return assertNever(by)
    }
  }
}

/** A moment as the page says it, in this computer's own time zone. */
function when(iso: string, timeZone?: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return "a time home couldn't say"
  return at.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  })
}

/** How a switch stands, and since when. */
export function standingLine(
  words: SwitchWords,
  standing: Standing,
  timeZone?: string
): string {
  const now = standing.on ? words.on : words.off
  if (standing.set === null) {
    return `${now}, as home starts: nobody has changed it.`
  }
  const did = standing.on ? words.turnedOn : words.turnedOff
  return `${now} since ${when(standing.set.at, timeZone)}, when ${who(standing.set.by)} ${did}.`
}

/** Why home's answer did not come. */
function refusalLine(why: Refusal): string {
  switch (why) {
    case "signed-out": {
      return "Sign in again to see home's switches."
    }
    case "not-operator": {
      return "Only the owner's account can see and change home's switches."
    }
    case "not-on-home": {
      return "Home doesn't have this switch yet. It arrives with home's next update."
    }
    case "unreachable": {
      return "Home didn't answer. It may be off, or this computer isn't on the home network."
    }
    case "no-home": {
      return "This build of the app doesn't talk to home."
    }
    case "failed": {
      return "Home answered, but its answer couldn't be read."
    }
    default: {
      return assertNever(why)
    }
  }
}

/**
 * A change home did not confirm, said over the screen. It may still have
 * landed, so the page asks home again and says how it stands then.
 */
export function changeFailed(
  words: SwitchWords,
  why: Refusal,
  on: boolean
): { readonly title: string; readonly description: string } {
  return {
    title: on ? words.unconfirmedOn : words.unconfirmedOff,
    description: `${refusalLine(why)} Asking home how it stands now.`,
  }
}

/** What the page says under the switch, for each state it can be in. */
export function statusLine(
  words: SwitchWords,
  state: SwitchesState,
  timeZone?: string
): string {
  switch (state.kind) {
    case "reading": {
      return PAGE.asking
    }
    case "unread": {
      return refusalLine(state.why)
    }
    case "read": {
      if (state.setting === null) {
        return standingLine(words, state.standing, timeZone)
      }
      return state.setting ? words.turningOn : words.turningOff
    }
    default: {
      return assertNever(state)
    }
  }
}
