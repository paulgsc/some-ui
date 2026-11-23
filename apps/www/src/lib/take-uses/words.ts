/**
 * Every word a take's uses say (INUSE, C1360), in the owner's terms: what
 * uses it, and what becomes of that once it is deleted. Pure, and tested
 * for machinery (`./__tests__/words.test.ts`).
 */
import { assertNever, listed } from "@some-ui/core-utils"

import type { HomeVideo, TakeUse, UseSource } from "./model"

/** `2026-w47` as the owner reads it: "week 47". */
export function weekName(week: string): string {
  const n = /-w(\d{1,2})$/u.exec(week)?.[1]
  return n === undefined ? `the week ${week}` : `week ${String(Number(n))}`
}

const quoted = (title: string | null): string | null =>
  title === null || title.trim() === "" ? null : `“${title.trim()}”`

/**
 * What becomes of the thing that uses it once it is deleted, for the sheet
 * and the mark's panel. A pick isn't cleared by a delete (the card, the
 * video and the idea keep naming the take), so each says what to do there.
 */
export function whatLoses(use: TakeUse): string {
  switch (use.kind) {
    case "spoken": {
      const title = quoted(use.title) ?? "its spoken card"
      return `Part ${String(use.part)} of ${title} plays it. The part will still name it, with nothing to play, until you pick another take there.`
    }
    case "scene": {
      const title = quoted(use.title) ?? "a Studio video"
      const scene =
        use.scene === null ? "A scene" : `Scene ${String(use.scene)}`
      return `${scene} of ${title} is chosen with it. The scene will still name it, with nothing to play, until you choose another take there.`
    }
    case "queued": {
      const title = quoted(use.title) ?? "a Studio video"
      const scene =
        use.scene === null ? "a scene" : `scene ${String(use.scene)}`
      return `Version ${String(use.rev)} of ${title}, which you finished for home to make, has it as ${scene}'s take. If home hasn't made that version yet, it can't with this take gone.`
    }
    case "idea": {
      const title = quoted(use.title) ?? "an idea"
      return `It is how you answered a question of ${title}. That answer will have no recording until you say it again.`
    }
    case "home": {
      const title = quoted(use.title) ?? HOME_VIDEO_NAMES[use.video]
      return use.withdraws
        ? `${title} on home plays it. Home withdraws that video once it's deleted; a copy you uploaded to YouTube is yours to take down.`
        : `${title} on home plays it. That video stays, but home can't make it again with this take gone.`
    }
    case "interview": {
      return `It went home as ${use.as === "answer" ? "an answer" : "a read"} in your interview ${weekName(use.week)}. If home made that week's essay, the essay goes too.`
    }
    case "rust": {
      return `It went home as ${use.as === "answer" ? "an answer" : "an opening question"} in your Rust Rounds ${weekName(use.week)}. If home made that week's essay, the essay goes too.`
    }
    default: {
      return assertNever(use)
    }
  }
}

/** A video home names with no title, by its kind. */
const HOME_VIDEO_NAMES: Readonly<Record<HomeVideo, string>> = {
  "feed-video": "A week's essay",
  essay: "A cards essay",
  "studio-video": "A Studio video",
  other: "A video",
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
  /** A take's mark, by its name for a screen reader: how many things use it. */
  markName: (n: number): string =>
    n === 1 ? "In use: 1 thing" : `In use: ${String(n)} things`,
  /** The mark's name, saying which recording it is on. */
  markOf: (name: string, what: string): string => `${name}, ${what}`,
  uncheckedName: "Couldn't check what uses it",
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
    `This phone can't read all of your ${listed(sources.map((source) => SOURCE_NAMES[source]))}, so it can't say whether one of them uses it.`,
  /** The sheet asks again: a store it read can't say now. */
  unreadSince:
    "Since this opened, this phone can't read everything that might use it. Look again before you delete.",
  /** Read everything, and nothing picks it. */
  unused: (n: number): string =>
    n === 1
      ? "No spoken card, Studio video, idea or week you sent picks it"
      : "No spoken card, Studio video, idea or week you sent picks them",
} as const
