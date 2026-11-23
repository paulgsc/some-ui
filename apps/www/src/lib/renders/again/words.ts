/**
 * What Run it again says (RETRY): every word in one pure table, in the
 * person's terms, held by its test to no machinery (`MACHINERY`): what is
 * kept where and what happens next, never a route, a state name or a code.
 */
import { assertNever } from "@some-ui/core-utils"

import { CONVEYOR_WORDS } from "@/lib/renders/conveyor"
import type { RenderFailed } from "@/lib/renders/model"
import { roughly } from "@/lib/renders/words"

import type { AgainAnswer, Plan, Step } from "./model"
import { produces, stopOf } from "./model"

const count = (n: number, one: string, many: string): string =>
  n === 1 ? `1 ${one}` : `${String(n)} ${many}`

/** What the run waits for, said as a person counts the takes. */
function onceAnswered(n: number): string {
  if (n === 0) return "Once home is asked to hear every one of them again."
  if (n === 1) return "Once home is asked to hear it again."
  return `Once home is asked to hear ${n === 2 ? "both" : `all ${String(n)}`} again.`
}

/**
 * What the owner can do about a render that couldn't finish, or that nothing
 * on the phone changes it (the owner, 2026-11-23: "when it says it failed, it
 * should surface that clearly so that I have immediate understanding of
 * what's going on"). What happened, where by name, and what home does about
 * it are `failedLine`'s, on the row and on Run it again alike.
 */
export function youLine(failed: RenderFailed): string {
  const stop = stopOf(failed)
  switch (stop.kind) {
    case "burnt": {
      return produces(failed.feed)
        ? "You can send it back in line now with Run it again."
        : "Nothing on this phone changes it; home's own try is the way."
    }
    case "takes-unheard": {
      return "Ask home to hear each recording again. A new recording doesn't stand in for one: the essay plays these very takes."
    }
    case "policy": {
      switch (stop.refusal.kind) {
        case "too-long": {
          return "Nothing on this phone changes it: what it's made from has to make a shorter video."
        }
        case "too-large": {
          return "Nothing on this phone changes it: what it's made from has to make a smaller video."
        }
        case "overflow": {
          return "Nothing on this phone changes it: what those scenes hold has to fit their frame. Home makes it by itself once it does."
        }
        default: {
          return assertNever(stop.refusal)
        }
      }
    }
    case "missing": {
      return stop.what === "take"
        ? "Nothing on this phone changes it: the essay has to name a take home keeps."
        : "Nothing on this phone changes it: the essay has to name a clip home keeps."
    }
    case "snips": {
      return stop.gone
        ? "Nothing on this phone changes it: run that Snips Capture again, and home makes it then."
        : "Nothing on this phone changes it: the essay has to name a picture its capture holds."
    }
    case "preview": {
      return "Ask for another on the template's page."
    }
    default: {
      return assertNever(stop)
    }
  }
}

/** The step of takes, as its heading and line say it. */
export function takesStep(plan: Extract<Plan, { kind: "takes" }>): {
  readonly title: string
  readonly line: string
  readonly done: boolean
} {
  const named = plan.takes.length
  if (!plan.read)
    return {
      title:
        named === 0
          ? "Recordings home couldn't hear"
          : `${count(named, "recording", "recordings")} home couldn't hear`,
      line: "Looking at which still wait on you…",
      done: false,
    }
  if (plan.waiting.length === 0)
    return {
      title:
        named === 1
          ? "The recording is answered"
          : named === 2
            ? "Both recordings are answered"
            : "Every recording is answered",
      line: "Home hears what you asked again first, before anything else it has to hear.",
      done: true,
    }
  return {
    title: `${count(plan.waiting.length, "recording", "recordings")} home couldn't hear`,
    line: "Ask home to hear each again. The essay plays these very recordings, so a new one doesn't stand in for them.",
    done: false,
  }
}

/** The way to the takes the step names. */
export const toTakes = (n: number): string =>
  n === 1 ? "See that take" : `See those ${String(n)} takes`

/** Under the button, what it does or what it waits for. */
export function runLine(plan: Plan): string {
  switch (plan.kind) {
    case "ready": {
      return "It's made when home has room, as every video is."
    }
    case "takes": {
      return plan.read && plan.waiting.length === 0
        ? "Home looks at it now instead of within the hour. It's made once home has heard them and has room."
        : onceAnswered(plan.waiting.length || plan.takes.length)
    }
    case "elsewhere": {
      return "Nothing here would make it now."
    }
    case "byItself": {
      return "Home tries it again by itself an hour after it stopped."
    }
    case "preview": {
      return "Ask for another on the template's page."
    }
    default: {
      return assertNever(plan)
    }
  }
}

/** What came of a tap that isn't a step to follow, said in a Notice. */
export function answerLine(
  answer: Exclude<AgainAnswer, { kind: "step" }>
): string {
  switch (answer.kind) {
    case "notHere": {
      return "Home can't run this one again: it may not keep it, or may need its next update first."
    }
    case "unreadable": {
      return "Home answered, but this phone couldn't read what it said. Try again in a while."
    }
    default: {
      return assertNever(answer)
    }
  }
}

/** The stations a run again moves along, in order (C1164's conveyor). */
export const AGAIN_STATIONS = ["asked", "line", "oven", "ready"] as const

export type AgainStation = (typeof AGAIN_STATIONS)[number]

/** Where it sits beside the line once it stopped. */
export type AgainAside = "burnt" | "setAside"

export const AGAIN_CONVEYOR_WORDS = {
  label: "Where the run again is",
  stations: {
    asked: "Asked",
    line: CONVEYOR_WORDS.stations.line,
    oven: CONVEYOR_WORDS.stations.oven,
    ready: CONVEYOR_WORDS.stations.ready,
  } satisfies Record<AgainStation, string>,
  asides: {
    burnt: CONVEYOR_WORDS.asides.burnt,
    setAside: "Set aside",
  } satisfies Record<AgainAside, string>,
} as const

/** The station `step` is at, and the side track it stopped on, if any. */
export function stepStation(step: Step): {
  readonly at: AgainStation
  readonly aside: AgainAside | null
} {
  switch (step.state) {
    case "missing":
    case "asked": {
      return { at: "asked", aside: null }
    }
    case "waiting": {
      return { at: "line", aside: null }
    }
    case "rendering": {
      return { at: "oven", aside: null }
    }
    case "done": {
      return { at: "ready", aside: null }
    }
    case "failed": {
      return { at: "oven", aside: "burnt" }
    }
    case "blocked": {
      return { at: "asked", aside: "setAside" }
    }
    default: {
      return assertNever(step.state)
    }
  }
}

/** Why home stopped it, by its short class (home's `reason`), in the person's terms. */
const BLOCKED_WORDS = {
  "too-long":
    "Home's limits on a video stop it. Home tries it again by itself once the essay, its limit or its way of making videos changes.",
  "take-missing": "A spoken card in it plays a recording home doesn't keep.",
  "clip-missing": "It shows a clip home doesn't keep.",
  "snip-missing": "It shows a picture of the app that home couldn't get.",
  settling: "Home is still getting this essay ready. Try again in a minute.",
  other: "Home set it aside, and running it again would end the same way.",
} as const

const BLOCKED_AS: Record<string, keyof typeof BLOCKED_WORDS> = {
  "too-long": "too-long",
  "too-large": "too-long",
  overflow: "too-long",
  "take-missing": "take-missing",
  "clip-missing": "clip-missing",
  "snip-missing": "snip-missing",
  "snip-gone": "snip-missing",
  settling: "settling",
}

function blockedLine(step: Step): string {
  if (step.reason === "take-unheard") {
    const n = step.items.length
    return n === 0
      ? "Home still can't hear recordings it plays. Ask home to hear them again."
      : `Home still can't hear ${count(n, "recording", "recordings")} it plays. Ask home to hear ${n === 1 ? "it" : "them"} again.`
  }
  const as =
    step.reason !== null && Object.hasOwn(BLOCKED_AS, step.reason)
      ? BLOCKED_AS[step.reason]
      : undefined
  return BLOCKED_WORDS[as ?? "other"]
}

/** The line under the conveyor: what is happening, in a sentence. */
export function stepLine(step: Step): string {
  switch (step.state) {
    case "missing": {
      return "Home doesn't keep this one any more."
    }
    case "asked": {
      return "Home has it. It goes in line within a minute."
    }
    case "waiting": {
      return "Waiting its turn. Home makes one video at a time, when it has room."
    }
    case "rendering": {
      return "Making it now."
    }
    case "done": {
      return "Made. It's under Finished lately on Renders."
    }
    case "failed": {
      return "It burnt again. Home tries again by itself an hour after."
    }
    case "blocked": {
      return blockedLine(step)
    }
    default: {
      return assertNever(step.state)
    }
  }
}

/** A time of day, as the phone's clock says it. */
const clock = (at: number, timeZone?: string): string =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(at * 1000))

/** About how long between two times, said roughly. */
const lasted = (from: number, to: number): string =>
  roughly(Math.max(0, to - from))

/**
 * The conveyor's log: since when, and for how long, each step it has taken,
 * oldest first, from the times home said.
 */
export function stepLog(
  step: Step,
  now: number,
  timeZone?: string
): ReadonlyArray<string> {
  const lines: Array<string> = []
  if (step.askedAt !== null)
    lines.push(`Asked at ${clock(step.askedAt, timeZone)}.`)
  if (step.startedAt !== null) {
    const until = step.endedAt ?? now
    lines.push(
      `In the oven from ${clock(step.startedAt, timeZone)}, for ${lasted(step.startedAt, until)}.`
    )
  } else if (step.state === "waiting" && step.askedAt !== null)
    lines.push(`Waiting its turn for ${lasted(step.askedAt, now)}.`)
  if (step.endedAt !== null) {
    const at = clock(step.endedAt, timeZone)
    if (step.state === "done") lines.push(`Ready at ${at}.`)
    else if (step.state === "failed") lines.push(`Burnt at ${at}.`)
    else if (step.state === "blocked") lines.push(`Set aside at ${at}.`)
  }
  return lines
}

export const AGAIN_WORDS = {
  heading: "Run it again",
  whatHappened: "What happened",
  whatYouCanDo: "What you can do",
  open: "Run it again",
  openElsewhere: "What it needs",
  /** On the row, beside the way in, what waits on the owner. */
  onRow: {
    ready: "Nothing waits on you",
    elsewhere: "Not from this phone",
    takes: (n: number): string =>
      n === 0
        ? "Recordings wait on you"
        : `${count(n, "take waits", "takes wait")} on you`,
  },
  heard: "Everything it plays is home's",
  run: "Send it back in line",
  button: "Run it again now",
  asking: "Asking home…",
  away: "Home didn't answer. It may be off, or away from this network. Try again once you're home.",
  busy: "This phone was busy with home just then. Try again in a moment.",
  unpaired: "Pair this phone with home to run it again.",
  gone: "This one isn't among those that couldn't finish any more: it's back in line, or made. Renders says which.",
  toRenders: "Back to Renders",
  /** Over Needs your attention, when it shows only an essay's takes. */
  only: (n: number, essay: string): string =>
    n === 1
      ? `The take ${essay} waits on`
      : `The ${String(n)} takes ${essay} waits on`,
  showAll: "Show all",
  onlyDone: "None of them waits on you now.",
  back: "Back to Run it again",
} as const
