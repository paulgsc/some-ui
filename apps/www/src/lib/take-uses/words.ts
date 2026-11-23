/**
 * Every word a take's uses say (INUSE, C1360), in the owner's terms: what
 * uses it, and what becomes of that once it is deleted. Pure, and tested
 * for machinery (`./__tests__/words.test.ts`).
 */
import { assertNever, listed } from "@some-ui/core-utils"

import type { TakeUse, UseSource } from "./model"

/** `2026-w47` as the owner reads it: "week 47". */
export function weekName(week: string): string {
  const n = /-w(\d{1,2})$/u.exec(week)?.[1]
  return n === undefined ? `the week ${week}` : `week ${String(Number(n))}`
}

const quoted = (title: string | null): string | null =>
  title === null || title.trim() === "" ? null : `“${title.trim()}”`

/** What uses it, after "In use · ": short, for a row's badge. */
export function whatUses(use: TakeUse): string {
  switch (use.kind) {
    case "spoken": {
      const title = quoted(use.title)
      return title === null
        ? `part ${String(use.part)} of a spoken card`
        : `part ${String(use.part)} of ${title}`
    }
    case "scene": {
      const title = quoted(use.title) ?? "a Studio video"
      return use.scene === null
        ? `chosen for a scene of ${title}`
        : `chosen for scene ${String(use.scene)} of ${title}`
    }
    case "idea": {
      const title = quoted(use.title)
      return title === null ? "answers an idea" : `answers ${title}`
    }
    case "interview": {
      return use.as === "answer"
        ? `your interview answer, ${weekName(use.week)}`
        : `your interview read, ${weekName(use.week)}`
    }
    case "rust": {
      return use.as === "answer"
        ? `your Rust Rounds answer, ${weekName(use.week)}`
        : `your Rust Rounds opening, ${weekName(use.week)}`
    }
    default: {
      return assertNever(use)
    }
  }
}

/** What becomes of the thing that uses it, once it is deleted: for the sheet. */
export function whatLoses(use: TakeUse): string {
  switch (use.kind) {
    case "spoken": {
      const title = quoted(use.title) ?? "its spoken card"
      return `Part ${String(use.part)} of ${title} plays it. That part has no take until you pick another.`
    }
    case "scene": {
      const title = quoted(use.title) ?? "a Studio video"
      return use.scene === null
        ? `It is chosen for a scene of ${title}. That scene has no take until you choose another.`
        : `It is chosen for scene ${String(use.scene)} of ${title}. That scene has no take until you choose another.`
    }
    case "idea": {
      const title = quoted(use.title) ?? "an idea"
      return `It is how you answered a question of ${title}. That answer has no recording until you say it again.`
    }
    case "interview": {
      return `It went home as ${use.as === "answer" ? "an answer" : "a read"} in your interview ${weekName(use.week)}. The essay of that week that plays it goes with it.`
    }
    case "rust": {
      return `It went home as ${use.as === "answer" ? "an answer" : "an opening question"} in your Rust Rounds ${weekName(use.week)}. The essay of that week that plays it goes with it.`
    }
    default: {
      return assertNever(use)
    }
  }
}

/** Each source, as "your …" names it. */
const SOURCE_NAMES: Readonly<Record<UseSource, string>> = {
  spoken: "spoken cards",
  videos: "Studio videos",
  ideas: "ideas",
  interview: "interview weeks",
  rust: "Rust Rounds weeks",
}

export const USE_WORDS = {
  /** A row's badge: "In use", then what uses it. */
  badge: "In use",
  badgeLine: (use: TakeUse): string => `In use · ${whatUses(use)}`,
  /** Beside the first use, when there are more. */
  more: (n: number): string => `+${String(n)} more`,
  /** The sheet's title when what it deletes is in use. */
  title: (n: number, used: number): string =>
    n === 1
      ? "Delete a take you're using?"
      : used === n
        ? `Delete ${String(n)} takes you're using?`
        : `Delete ${String(n)} takes, ${String(used)} you're using?`,
  inUseTitle: "In use",
  /** The sheet asks again: a use appeared since it opened. */
  changed:
    "Something started using it since this opened. Look again before you delete.",
  /** The sheet's delete when what it deletes is in use. */
  confirm: (n: number): string =>
    n === 1 ? "Delete it anyway" : `Delete all ${String(n)} anyway`,
  checkingTitle: "Checking",
  checking: "Checking what on this phone uses it…",
  uncheckedTitle: "Couldn't check",
  /** Sources this phone couldn't read, so a use may be missing. */
  unread: (sources: ReadonlyArray<UseSource>): string =>
    `This phone couldn't read your ${listed(sources.map((source) => SOURCE_NAMES[source]))} just now, so it can't say whether one of them uses it.`,
  /** Read everything, and nothing picks it. */
  unused: (n: number): string =>
    n === 1
      ? "No spoken card, Studio video, idea or week you sent picks it"
      : "No spoken card, Studio video, idea or week you sent picks them",
} as const
