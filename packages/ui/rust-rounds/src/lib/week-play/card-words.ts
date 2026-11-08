/**
 * The Practice Home card's words for the week (RR13), apart from the rest of
 * the week's (`./words`) so the card's entry (`src/entry.ts`) loads nothing
 * but these. Held to the same rules by `__tests__/words.test.ts`.
 */
import type { Week } from "@rust-rounds/lib/formats/week"
import { PACIFIC_TIME_ZONE } from "@some-ui/core-utils"

/** A week's number, as the owner knows it: `2026-w46` is week 46. */
export const weekNumber = (id: string): number => Number(id.slice(6))

/** The day of the week of `at`, on the owner's clock. */
export const weekday = (at: string): string =>
  new Date(at).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: PACIFIC_TIME_ZONE,
  })

/** The time of day of `at`, on the owner's clock: 23:59. */
export const clock = (at: string): string =>
  new Date(at).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: PACIFIC_TIME_ZONE,
  })

type CardWeek = Pick<Week, "id" | "due"> & {
  readonly company: Pick<Week["company"], "name">
}

export const CARD_WORDS = {
  open: (week: CardWeek, said: number, of: number): string =>
    `Week ${weekNumber(week.id)} · ${week.company.name} · due ${weekday(week.due)} · ${said} of ${of} said`,
  sent: (said: number, of: number): string =>
    `Sent: ${said} of ${of}. The essay comes after the deadline.`,
  closed: (week: Pick<Week, "id">): string =>
    `Week ${weekNumber(week.id)} has closed. Its essay comes from home.`,
} as const
