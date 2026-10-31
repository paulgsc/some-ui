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
   * A record that drains only while its own screen is open (aph): its mark
   * there says how its last send went.
   */
  unseen: (opens: string): string =>
    `How its last send went shows once ${opens} opens.`,
  /** When its last send reached home. */
  lastWent: (when: string): string => `Last went to home ${when}.`,
  morning: "This morning's jobs run",
  filesLegend: "Where Jobs' files are",
  routine: "The reflections routine",
  /** The sharing marks' legend: their two axes. */
  sharingLegend: "Where it's kept, and how it last went",
  /** The phone's own record of what went wrong (`lib/failure-log`). */
  failures: "What went wrong lately",
  failuresLead: (count: string): string =>
    `The last ${count} problems this phone ran into, newest first, each as the app wrote it down. They stay on this phone.`,
  failuresNone: "Nothing has gone wrong since this phone began keeping track.",
  failuresWhat: "what went wrong",
} as const

/** Korean's look at what the routine left on home. */
export const LOOK_WORDS = {
  name: "Korean's look at home",
  words: {
    read: "Looked",
    busy: "Home busy",
    unreachable: "No answer",
    forgotten: "Pair again",
    failed: "Didn't go",
    "not-yet": "Not yet",
  } satisfies Record<Look, string>,
  /** Its legend: what each look's mark means here. */
  legend: {
    read: "Korean looked at home, and home answered",
    busy: "Home was busy when Korean looked",
    unreachable: "Home didn't answer when Korean looked",
    forgotten: "Home no longer knows this phone: pair it again",
    failed: "Something went wrong when Korean looked",
    "not-yet": "Korean looks the next time its list opens",
  } satisfies Record<Look, string>,
} as const
