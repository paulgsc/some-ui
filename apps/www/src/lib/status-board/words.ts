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
  /** A row's link, by its name. */
  open: (name: string): string => `${name}: open where it runs`,
  /** aph's run shows only on aph's own screens, which hold its lane. */
  aphElsewhere: "How its last send went shows in aph.",
  morning: "This morning's jobs run",
  legend: "What the marks mean",
  /** The sharing marks' legend: their two axes. */
  sharingLegend: "Where it's kept, and how it last went",
  /** Nothing on the board: a phone that runs none of it yet. */
  none: "Nothing runs on this phone yet. Pair it with home in Settings to start.",
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
  /** Its legend's lines for the two looks the sharing marks don't draw. */
  off: "Korean doesn't look at home: the choice is off",
  notYet: "Korean looks the next time its list opens",
} as const
