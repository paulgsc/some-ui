/**
 * The Practice Home card's words for the week (RR13), apart from the rest of
 * the week's (`./words`) so the card's entry (`src/entry.ts`) loads nothing
 * but these. Held to the same rules by `__tests__/words.test.ts`.
 */
import type { Week } from "@rust-rounds/lib/formats/week"
import { weekNumber } from "@rust-rounds/lib/formats/week-id"
import { PACIFIC_TIME_ZONE } from "@some-ui/core-utils"

export { weekNumber } from "@rust-rounds/lib/formats/week-id"

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
  /** Sent, and open until the deadline to send again (RR22). */
  sent: (week: CardWeek, said: number, of: number): string =>
    `Week ${weekNumber(week.id)} · sent: ${said} of ${of} · open until ${weekday(week.due)}`,
  closed: (week: Pick<Week, "id">): string =>
    `Week ${weekNumber(week.id)} has closed. Its essay comes from home.`,
  /** Closed, with what was sent by the deadline: read back on opening. */
  closedSent: (week: Pick<Week, "id">, said: number, of: number): string =>
    `Week ${weekNumber(week.id)} has closed · sent: ${said} of ${of}. Its essay comes from home.`,
  /** Under a closed week's card, the way to its essay in Studio (RR17). */
  essay: "Watch its essay",
} as const
