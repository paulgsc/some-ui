/**
 * Every word the status page shows of its own (#2165): its groups, its
 * glance, and the words of the one process whose surface had none to lend,
 * Korean's look at home. Each row's sentences are its surface's own
 * (`lib/home-link/words`, `lib/jobs/morning`); these never repeat them, and
 * name no machinery (`./index.test.ts`).
 */
import type { GroupId, Look } from "."

export const BOARD_WORDS = {
  glance: "Everything at a glance",
  needsYou: "Needs you",
  groups: {
    home: "Sending to home",
    jobs: "Jobs",
    korean: "Korean",
  } satisfies Record<GroupId, string>,
  /**
   * A kept record whose last send this launch hasn't seen: its own screen's
   * mark says how it went once that screen opens.
   */
  unseen: (opens: string): string =>
    `How its last send went shows once ${opens} opens.`,
  /** When its last send reached home. */
  lastWent: (when: string): string => `Last went to home ${when}.`,
  morning: "This morning's jobs run",
  /** A choice made before this phone kept its choices: its own mark knows. */
  unsure: "Not known here",
  /** The sharing marks' legend: their two axes. */
  sharingLegend: "Where it's kept, and how it last went",
} as const

/** Korean's look at what the routine left on home (LA12). */
export const LOOK_WORDS = {
  name: "Korean's look at home",
  words: {
    read: "Looked",
    busy: "Home busy",
    unreachable: "No answer",
    forgotten: "Pair again",
    failed: "Didn't go",
    "not-yet": "Not yet",
    off: "Off",
  } satisfies Record<Look, string>,
  /** Its legend: what each look's mark means here. */
  legend: {
    read: "Korean looked at home, and home answered",
    busy: "Home was busy when Korean looked",
    unreachable: "Home didn't answer when Korean looked",
    forgotten: "Home no longer knows this phone: pair it again",
    failed: "Something went wrong when Korean looked",
    "not-yet": "Korean looks the next time its list opens",
    off: "Korean doesn't look at home: the choice is off",
  } satisfies Record<Look, string>,
} as const
