/**
 * How many recommendations fit one row, and how many search results fit the
 * overlay - the two numbers epic #852 turns on.
 *
 * Both live here, in the pure package, for one reason: the launcher and the
 * test that proves the launcher fits have to agree on them. A constant
 * written twice is a constant that will disagree exactly once, in the commit
 * that changes it, and the fit test would then be measuring a layout that
 * isn't shipped.
 */

/**
 * Tailwind's `sm` and `lg`, in pixels.
 *
 * Mirrored from the breakpoints the launcher's grid classes actually use
 * (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`). Keeping them next to the
 * function that reads them means the column count and the item count are one
 * decision rather than two that drift.
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
