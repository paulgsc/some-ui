/**
 * Feedback on an episode (SFEED6, #2745): the fixed categories a note picks
 * from (SFEED decisions 7 and 10, #2670), and where each sends the note.
 * Where a note goes is code's, never a choice made on screen or by the
 * routine (FEED decision 5, #2643):
 *
 * - what it said shapes the feed's next fill (`nextFill`);
 * - a broken slide is a defect (`defect`);
 * - the rest of how it looked or sounded changes the feed's template
 *   (`template`).
 *
 * The phone (`apps/www/src/lib/episode-feedback`) and the routine's filing
 * (`./pending`) both read it, and home checks the same set in the same order
 * (paulgsc/server `episode_note_repo::CATEGORIES`).
 */

/** What it said (decision 7's first group). */
export const SAID = [
  "shallow",
  "technical",
  "missedIntuition",
  "unsupported",
  "tooLong",
  "tooShort",
] as const

/** How it looked or sounded (decision 7's second group). */
export const SHOWN = [
  "textClipped",
  "slideShakes",
  "overlap",
  "hardToRead",
  "pacing",
  "voice",
  "musicLoud",
  "subtitlesOff",
] as const

export const CATEGORIES = [...SAID, ...SHOWN] as const

export type Category = (typeof CATEGORIES)[number]

/** Where a note goes once it is filed, in the order a note lists them. */
export const DESTINATIONS = ["nextFill", "template", "defect"] as const

export type Destination = (typeof DESTINATIONS)[number]

/** A slide drawn wrong is broken: the template promised better (#2671). */
const BROKEN: ReadonlySet<Category> = new Set<Category>([
  "textClipped",
  "slideShakes",
  "overlap",
])

const SAID_SET: ReadonlySet<Category> = new Set<Category>(SAID)

export function destinationOf(category: Category): Destination {
  if (SAID_SET.has(category)) return "nextFill"
  return BROKEN.has(category) ? "defect" : "template"
}

/** Every place a note's categories send it, each once, in `DESTINATIONS` order. */
export function destinationsOf(
  categories: ReadonlyArray<Category>
): ReadonlyArray<Destination> {
  const reached = new Set(categories.map(destinationOf))
  return DESTINATIONS.filter((destination) => reached.has(destination))
}
