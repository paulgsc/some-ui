/**
 * Every word the drag-down indicator says (PULL0). Pure, and the one place
 * they live, so they stay in the person's terms: what the page is doing and
 * since when, never the machinery behind it (`__tests__/words.test.ts`).
 */
import { assertNever } from "@some-ui/core-utils"

import type { Phase } from "./model"

/** A moment as the time of day: the indicator only speaks of today. */
const timeOfDay = (at: number): string =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })

/** "a, b, and c": the indicator speaks English, as every screen here does. */
const AND = new Intl.ListFormat("en", { type: "conjunction" })

/** The most a failure names before it counts the rest. */
const NAMED = 2

/**
 * `unread` as a list the pill can hold: two names, then how many more (three
 * long names don't fit a narrow phone's two lines).
 */
const listed = (unread: ReadonlyArray<string>): string =>
  AND.format(
    unread.length > NAMED
      ? [...unread.slice(0, NAMED), `${unread.length - NAMED} more`]
      : unread
  )

export const PULL_WORDS = {
  pulling: "Drag down to check again",
  armed: "Let go to check again",
  checking: "Checking again…",
  done: (when: string): string => `Up to date at ${when}`,
  /** What the queries and loaders of the page in view are, when one fails. */
  page: "this page",
  /** `unread` names what could not be read; empty when nothing said what. */
  failed: (unread: ReadonlyArray<string>): string =>
    unread.length === 0
      ? "Couldn’t check everything just now"
      : `Couldn’t check ${listed(unread)} just now`,
  offline: "No connection: showing what was here",
} as const

/** What the indicator says in `phase`, or null when it shows nothing. */
export function pullWords(
  phase: Phase,
  when: (at: number) => string = timeOfDay
): string | null {
  switch (phase.kind) {
    case "idle":
    case "tracking": {
      return null
    }
    case "pulling": {
      return PULL_WORDS.pulling
    }
    case "armed": {
      return PULL_WORDS.armed
    }
    case "checking": {
      return phase.shown ? PULL_WORDS.checking : null
    }
    case "done": {
      return PULL_WORDS.done(when(phase.at))
    }
    case "failed": {
      return phase.offline
        ? PULL_WORDS.offline
        : PULL_WORDS.failed(phase.unread)
    }
    default: {
      return assertNever(phase)
    }
  }
}
