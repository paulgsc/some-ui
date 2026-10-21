/**
 * Every word the sentence's mark, its facts and the clear control show
 * (adaptive-learning canon Rem. 7.5). Pure, and the one place those words
 * live, so they stay in the person's terms: what was shown, what they read,
 * what is kept where, and since when. No tally, row, queue, id or storage
 * term reaches the screen (`index.test.ts`).
 *
 * The phone knows what it showed and cannot hear whether the learner read,
 * so the mark says "Seen before" and not "Read before".
 */

import { addDays, counted, dayOf, formatDay } from "@some-ui/core-utils"
import type { Begun, EntryRole } from "@topik/lib/topik/read-aloud/set-machine"
import type { Mark, TallyRow } from "@topik/lib/topik/read-aloud/tally"

const MARK: Record<Mark, string> = { new: "New", seen: "Seen before" }

/**
 * The day an instant fell on, as a person says it beside `today` (a local
 * day key): "today", "yesterday", or "Oct 5", with the year once it is not
 * this one.
 */
function dateWords(iso: string, today: string): string {
  const day = dayOf(new Date(iso))
  if (day === today) return "today"
  if (day === addDays(today, -1)) return "yesterday"
  const year = day.slice(0, 4)
  return year === today.slice(0, 4)
    ? formatDay(day)
    : `${formatDay(day)}, ${year}`
}

const times = (n: number): string => (n === 1 ? "once" : counted(n, "time"))

const sentences = (n: number): string => counted(n, "sentence")

const were = (n: number): string => (n === 1 ? "was" : "were")

/** What the tally holds, as the clear control says it. */
const shownAndRead = (size: number, since: string, today: string): string =>
  `${sentences(size)} ${were(size)} shown and read to the end, since ${dateWords(since, today)}`

export const TALLY_WORDS = {
  mark: (mark: Mark): string => MARK[mark],
  /** The mark's button name: what it opens. */
  openFacts: (mark: Mark): string =>
    `${MARK[mark]}. See what is kept about this sentence`,
  title: "This sentence",
  holding: "Reading is paused while this is open.",
  done: "Done",
  labels: {
    shown: "Shown",
    first: "First shown",
    last: "Last shown",
    read: "Read to the end",
    why: "Why it is here",
  },
  shown: (row: TallyRow): string => times(row.shown),
  read: (row: TallyRow): string =>
    row.read === 0 ? "Not yet" : times(row.read),
  date: dateWords,
  /** Why the sentence is on screen, or null when nothing is worth saying. */
  why: (role: EntryRole, begun: Begun | null): string | null => {
    if (role === "return") return "You marked it stuck, so it came back."
    if (begun === "repeat") {
      return "Every sentence had been shown, so the one shown longest ago came back."
    }
    return begun === "fresh" ? "I hadn't shown it yet this sitting." : null
  },
  kept: (since: string, today: string, kept: boolean): string =>
    kept
      ? `Kept on this phone, since ${dateWords(since, today)}.`
      : "This phone couldn't keep this, so it lasts only until you close it.",
  clear: {
    kept: (size: number, since: string, today: string): string =>
      `Kept on this phone: when ${shownAndRead(size, since, today)}.`,
    /** The first press only asks. */
    ask: "Clear",
    askName: "Clear what is kept about sentences",
    /** The second press says what goes, and what stays. */
    title: "Clear what is kept about sentences?",
    goes: (size: number, since: string, today: string): string =>
      `This clears when ${shownAndRead(size, since, today)}. Your practice record stays.`,
    confirm: "Clear it",
    cleared: "Cleared. Every sentence starts as New again.",
    notCleared: "This phone couldn't clear it.",
  },
} as const
