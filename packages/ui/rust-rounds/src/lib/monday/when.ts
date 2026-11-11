/**
 * The owner's clock for the Monday routine: a week opens Monday 00:00 and is
 * due Sunday 23:59 in `PACIFIC_TIME_ZONE`, as `readWeek` holds it.
 */
import {
  addDays,
  PACIFIC_TIME_ZONE,
  pacificDay,
  pacificMinutes,
  weekOf,
} from "@some-ui/core-utils"

/**
 * `day` at `hh:mm` on the owner's clock, as an instant with its offset
 * (`2026-11-16T00:00:00-08:00`). Pacific is UTC-8 or UTC-7; the one whose
 * reading comes back unchanged is the offset that day has at that time.
 */
function pacificInstant(day: string, hh: number, mm: number): string {
  const clock = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
  for (const offset of ["-08:00", "-07:00"]) {
    const at = `${day}T${clock}:00${offset}`
    const date = new Date(at)
    if (pacificDay(date) === day && pacificMinutes(date) === hh * 60 + mm) {
      return at
    }
  }
  throw new Error(`${day} ${clock} isn't a time in ${PACIFIC_TIME_ZONE}`)
}

/** The week that holds `now` on the owner's clock: its Monday and Sunday, and when it opens and is due. */
export function weekAround(now: Date): {
  monday: string
  sunday: string
  opens: string
  due: string
} {
  const monday = weekOf(pacificDay(now))
  const sunday = addDays(monday, 6)
  return {
    monday,
    sunday,
    opens: pacificInstant(monday, 0, 0),
    due: pacificInstant(sunday, 23, 59),
  }
}
