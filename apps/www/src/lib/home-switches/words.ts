/**
 * Every word the home-switches page shows: what a switch does, how it
 * stands, who changed it and when, and why home's answer did not come.
 * Pure, and the one place those words live, so they stay in the person's
 * terms (what home does, since when, and who said so) and never the
 * machinery's: no address, request, status code, variable or stored name
 * reaches the screen (`__tests__/words.test.ts`).
 */
import { assertNever } from "@some-ui/core-utils"

import type { Refusal, SetBy, Standing, SwitchesState } from "./model"

export const PAGE = {
  title: "Home's switches",
  intro:
    "What home does while it runs. Home keeps every change made here: what it became, who made it and when.",
  asking: "Asking home…",
  askAgain: "Ask again",
} as const

export const RUST_ROUNDS = {
  label: "Rust Rounds recording",
  about:
    "Home runs each program in your Rust Rounds and their weekly sets, in a sandbox, and keeps what the compiler printed. Paused, rounds and weeks are still kept, and their programs wait until recording is back on. Home looks at this switch each time it sets out to run programs, about once a minute, and finishes any run already under way first.",
} as const

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
export function when(iso: string, timeZone?: string): string {
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

/** How recording stands, and since when. */
export function standingLine(standing: Standing, timeZone?: string): string {
  const now = standing.recording ? "On" : "Paused"
  if (standing.set === null) {
    return `${now}, as home starts: nobody has changed it.`
  }
  const did = standing.recording ? "turned it on" : "paused it"
  return `${now} since ${when(standing.set.at, timeZone)}, when ${who(standing.set.by)} ${did}.`
}

/** While a change is on its way to home. */
export function changingLine(recording: boolean): string {
  return recording ? "Turning recording on…" : "Pausing recording…"
}

/** Why home's answer did not come. */
export function refusalLine(why: Refusal): string {
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

/** A change that did not land, said over the screen. */
export function changeFailed(
  why: Refusal,
  recording: boolean
): { readonly title: string; readonly description: string } {
  return {
    title: recording
      ? "Recording wasn't turned on."
      : "Recording wasn't paused.",
    description: refusalLine(why),
  }
}

/** What the page says under the switch, for each state it can be in. */
export function statusLine(state: SwitchesState, timeZone?: string): string {
  switch (state.kind) {
    case "reading": {
      return PAGE.asking
    }
    case "unread": {
      return refusalLine(state.why)
    }
    case "read": {
      return state.setting === null
        ? standingLine(state.standing, timeZone)
        : changingLine(state.setting)
    }
    default: {
      return assertNever(state)
    }
  }
}
