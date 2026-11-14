/**
 * Whether a key is a cards essay's (CARDS7, #2979), as home checks one
 * (paulgsc/server `cards_essays::pass::day_of`): `<slug>-<YYYY-MM-DD>`
 * (`CARDS_KEY`), a day the calendar has, at most 128 long. Pure, and in every
 * build, since the essay page's route parses its key with it.
 */
import { CARDS_KEY } from "@some-ui/video-render"

/** The longest key home keeps an essay under (`cards_essays::pass::MAX_KEY`). */
const MAX_ESSAY_KEY = 128

export function isEssayKey(key: string): boolean {
  if (key.length > MAX_ESSAY_KEY || !CARDS_KEY.test(key)) return false
  const day = key.slice(-10)
  const parsed = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(day)
}
