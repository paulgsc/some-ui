/**
 * The day an instant fell on, as a person says it beside `today` (a local
 * day key): "today", "yesterday", or "Oct 5", with the year once it is not
 * this one.
 */

import { addDays, dayOf, formatDay } from "@some-ui/core-utils"

export function dayWords(iso: string, today: string): string {
  const day = dayOf(new Date(iso))
  if (day === today) return "today"
  if (day === addDays(today, -1)) return "yesterday"
  const year = day.slice(0, 4)
  return year === today.slice(0, 4)
    ? formatDay(day)
    : `${formatDay(day)}, ${year}`
}
