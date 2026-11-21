/**
 * Every word the home-switches page shows: what each setting does, how it
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
  SettingKey,
  SettingValue,
  Standing,
  SwitchesState,
} from "./model"

export const PAGE = {
  title: "Home's switches",
  intro:
    "What home does while it runs. Home keeps every change made here: what it became, who made it and when.",
  asking: "Asking home…",
  askAgain: "Ask again",
} as const

/**
 * One setting's words, over its kind of value (C916): what it does, how a
 * value reads, what whoever changed it did, a change on its way, and one
 * home did not confirm.
 */
export type SettingWords<V> = {
  readonly label: string
  readonly about: string
  /** How a value stands, at the start of the standing line. */
  readonly now: (value: V) => string
  /** What whoever set it to `value` did. */
  readonly did: (value: V) => string
  /** While `value` is on its way to home. */
  readonly doing: (value: V) => string
  /** A change to `value` home did not confirm. */
  readonly unconfirmed: (value: V) => string
}

/** One switch's words: what it does, and how it says on and off. */
type SwitchWords = {
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

const RUST_ROUNDS: SwitchWords = {
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

const GAME_FEED: SwitchWords = {
  label: "Following NFL games",
  about:
    "Home follows each NFL game this week as it's played, and keeps every play, so Game Day on your phone can show them live and what you said about them is matched to the play. Paused, home asks for no games and the phone says home isn't following games; every game and play already kept stays. Home looks at this switch every few seconds, before it asks for anything, and lets what it already asked for come back first.",
  on: "Following",
  off: "Paused",
  turnedOn: "turned it on",
  turnedOff: "paused it",
  turningOn: "Turning following games on…",
  turningOff: "Pausing following games…",
  unconfirmedOn: "Home didn't confirm it is following games.",
  unconfirmedOff: "Home didn't confirm following games is paused.",
}

/** A switch's words as a setting's: each line by whether it is on. */
const switchWords = (words: SwitchWords): SettingWords<boolean> => ({
  label: words.label,
  about: words.about,
  now: (on) => (on ? words.on : words.off),
  did: (on) => (on ? words.turnedOn : words.turnedOff),
  doing: (on) => (on ? words.turningOn : words.turningOff),
  unconfirmed: (on) => (on ? words.unconfirmedOn : words.unconfirmedOff),
})

/** The teams followed live (#3329): ESPN's abbreviations, none for every game. */
export const GAME_TEAMS = {
  label: "Teams followed live",
  about:
    "Only these teams' games get live plays, and home asks ESPN only around their kickoffs. None chosen follows every game.",
  now: (teams: ReadonlyArray<string>) =>
    teams.length === 0 ? "Every game" : teams.join(", "),
  did: (teams: ReadonlyArray<string>) =>
    teams.length === 0 ? "chose every game" : "chose these teams",
  doing: () => "Saving the teams followed…",
  unconfirmed: () => "Home didn't confirm the teams followed.",
  /** The chips' name, for a screen reader. */
  group: "Teams to follow live",
  save: "Save",
} as const satisfies SettingWords<ReadonlyArray<string>> &
  Readonly<Record<"group" | "save", string>>

/** Each setting's words, by the setting, over its own kind of value. */
export const SWITCH_WORDS: {
  readonly [K in SettingKey]: SettingWords<SettingValue[K]>
} = {
  "rust-rounds": switchWords(RUST_ROUNDS),
  "game-feed": switchWords(GAME_FEED),
  "game-teams": GAME_TEAMS,
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

/** How a setting stands, and since when. */
export function standingLine<V>(
  words: SettingWords<V>,
  standing: { readonly value: V; readonly set: Standing["set"] },
  timeZone?: string
): string {
  const now = words.now(standing.value)
  if (standing.set === null) {
    return `${now}, as home starts: nobody has changed it.`
  }
  return `${now} since ${when(standing.set.at, timeZone)}, when ${who(standing.set.by)} ${words.did(standing.value)}.`
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
    case "refused": {
      return "Home didn't take that change."
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
export function changeFailed<V>(
  words: SettingWords<V>,
  why: Refusal,
  value: V
): { readonly title: string; readonly description: string } {
  return {
    title: words.unconfirmed(value),
    description: `${refusalLine(why)} Asking home how it stands now.`,
  }
}

/** What the page says under the setting, for each state it can be in. */
export function statusLine<K extends SettingKey>(
  words: SettingWords<SettingValue[K]>,
  state: SwitchesState<K>,
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
      return words.doing(state.setting)
    }
    default: {
      return assertNever(state)
    }
  }
}
