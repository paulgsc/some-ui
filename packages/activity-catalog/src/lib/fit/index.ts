/**
 * How many recommendations fit one row, and how many search results fit the
 * overlay (#852).
 *
 * Here, in the pure package, so the launcher and the test that proves it fits
 * read the same constants.
 */

/**
 * Tailwind's `sm` and `lg`, in pixels.
 *
 * Mirrored from the launcher's grid classes
 * (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`), so column count and item
 * count are one decision.
 */
const SM = 640
const LG = 1024

/**
 * The number of activities the launcher renders, given the viewport width.
 *
 * This is `k`. It is a function of the box, not of the catalogue: it is
 * exactly one row of cards at each breakpoint, which is why adding a
 * twentieth activity changes nothing about the layout. Two on a phone, three
 * on a tablet, four on a desktop.
 */
export function recommendedCount(viewportWidth: number): number {
  if (viewportWidth >= LG) return 4
  if (viewportWidth >= SM) return 3
  return 2
}

/**
 * The largest `k` any breakpoint asks for. Useful where a caller needs a
 * bound before it has measured anything - a server render, a first paint.
 */
export const MAX_RECOMMENDED_COUNT = 4

/**
 * `m`: how many fuzzy matches the search overlay shows.
 *
 * A small fixed number, not "all matches". The overlay is a bounded surface
 * like everything else in this epic - a scrolling result list is the same
 * failure wearing a different hat - and eight compact rows is what fits under
 * the field at the shortest viewport the fit sweep tests (560px tall).
 *
 * The rest of the catalogue is not unreachable at `m = 8`; it is reachable by
 * typing more, which is what a search field is for.
 */
export const SEARCH_RESULT_LIMIT = 8
