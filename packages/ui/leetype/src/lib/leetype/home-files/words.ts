import type { ListingEnded } from "./model"

/**
 * What the picker's "From home" list says, in the person's terms: what is
 * kept where, never the machinery behind it (CLAUDE.md, "State in the
 * person's terms"). Pure; `./index.test.ts` checks it.
 */
export const HOME_FILES_WORDS = {
  heading: "From home",
  looking: "Looking at what home holds…",
  none: "Home holds no session files for LeetType yet.",
  /** Why a look brought nothing new; what was shown last stays. */
  ended: {
    busy: "Home was busy. It is asked again the next time this list opens.",
    unreachable:
      "Home couldn't be reached. It is asked again the next time this list opens.",
    forgotten:
      "Home no longer knows this phone. Pair it again in Settings to see what home holds.",
    failed:
      "Something went wrong reading what home holds. It is asked again the next time this list opens.",
  } satisfies Record<ListingEnded, string>,
  thread: (thread: number | null): string =>
    thread === null ? "Other sessions" : `Thread ${String(thread)}`,
  current: "The thread you're on",
  allOnPhone: "All on this phone, so it plays offline.",
  keep: (missing: number, of: number): string =>
    missing === of
      ? `Keep ${of === 1 ? "it" : `all ${String(of)}`} on this phone`
      : `Keep the other ${String(missing)} on this phone`,
  keeping: (done: number, of: number): string =>
    `Keeping ${String(done + 1)} of ${String(of)} on this phone…`,
  onPhone: "On this phone",
  kept: (n: number): string =>
    n === 1
      ? "Kept 1 session on this phone. It plays offline."
      : `Kept ${String(n)} sessions on this phone. They play offline.`,
  /** Some of a thread didn't come or wasn't kept; what came stays kept. */
  someLeft: (n: number, why: string): string =>
    `${n === 1 ? "1 session wasn't" : `${String(n)} sessions weren't`} kept: ${why}`,
  /** The content lint's findings, which never refuse a file. */
  noted: (n: number): string =>
    n === 1
      ? "1 has notes for its author and still plays."
      : `${String(n)} have notes for their author and still play.`,
  gone: "home no longer holds it.",
  nameTaken: (name: string): string =>
    `this phone already holds a different file named ${name}.`,
  full: "this phone is full. Free some space, then keep it again.",
  couldNotKeep: "it couldn't be kept on this phone. Try again.",
  why: {
    busy: "home was busy. Try again in a moment.",
    unreachable: "home couldn't be reached. Try again once it can be.",
    forgotten: "home no longer knows this phone. Pair it again in Settings.",
    failed: "something went wrong. Try again.",
  } satisfies Record<ListingEnded, string>,
} as const
