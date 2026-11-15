/**
 * Whether a key is a cards essay's (CARDS7, #2979), as home checks one
 * (paulgsc/server `cards_essays::pass::day_of`): `<slug>-<YYYY-MM-DD>`
 * (`CARDS_KEY`), a day the calendar has, at most 128 long; and what an essay
 * is called by it. Pure, and in every build, since the essay page's route
 * parses its key with it.
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

/**
 * A cards essay by its key (`<slug>-<YYYY-MM-DD>`, CARDS7): its subject in
 * words and the day it was checked, "Rust scratchpad, as of Saturday,
 * November 14" (C356). Studio › Renders and Episodes both name an essay by
 * it, where home gives no title of its own.
 */
export function essayName(key: string): string {
  const day = key.slice(-10)
  const words = key.slice(0, -11).split("-").join(" ")
  const subject = words.charAt(0).toUpperCase() + words.slice(1)
  return `${subject}, as of ${dayOf(day)}`
}

/** A day (`YYYY-MM-DD`) as a person reads it: "Friday, November 13". */
export function dayOf(on: string): string {
  const [year = 0, month = 1, day = 1] = on.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}
