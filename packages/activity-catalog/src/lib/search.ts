import { SEARCH_RESULT_LIMIT } from "./fit"
import type { ActivityDefinition } from "./types"

/**
 * Which fields a query is matched against, and how much each one counts.
 *
 * Name dominates: someone typing "hangul" is naming the thing they want, not
 * describing it. Description and the audio blurb still match, because "typing"
 * and "pronunciation" are real ways people look for an activity they cannot
 * remember the name of - they just never outrank a name hit.
 */
const FIELD_WEIGHT = {
  name: 1,
  description: 0.5,
  blurb: 0.35,
} as const

/**
 * Match qualities, best first. The gaps matter more than the values: an exact
 * name beats a name prefix beats a name substring beats anything found by
 * scattering the query's letters through the text.
 */
const EXACT = 1
const PREFIX = 0.9
const SUBSTRING = 0.75
const SUBSEQUENCE_MAX = 0.5

/**
 * Below this, a "match" is noise - the kind where two letters happen to
 * appear in order somewhere in a long description. Bounded results make this
 * matter: eight slots filled with coincidences are eight slots the real
 * answer didn't get.
 */
const MIN_SCORE = 0.15

/**
 * Scattered-letter matching is off for single characters. Every activity
 * contains "a" somewhere, so a one-letter query would match the entire
 * catalogue at a score that says nothing, and the ranking tie-break would end
 * up doing all the work.
 */
const MIN_SUBSEQUENCE_QUERY_LENGTH = 2

/**
 * Does `query` appear in `text` as a subsequence, and how tightly?
 *
 * Returns the span (in characters of `text`) the match occupied, or `null`.
 * The span is what separates "Hangul Honeycomb" matching "hangul" from it
 * matching "hnb" - both are subsequences, only one is what someone meant, and
 * the tighter the span the closer the match is to a real substring.
 */
function subsequenceSpan(text: string, query: string): number | null {
  let cursor = 0
  let start = -1

  for (const character of query) {
    const found = text.indexOf(character, cursor)
    if (found === -1) return null
    if (start === -1) start = found
    cursor = found + 1
  }

  return cursor - start
}

/** 0 when `query` is nowhere in `text`; 1 when they are the same string. */
function matchQuality(text: string, query: string): number {
  if (text.length === 0) return 0
  if (text === query) return EXACT
  if (text.startsWith(query)) return PREFIX
  if (text.includes(query)) return SUBSTRING
  if (query.length < MIN_SUBSEQUENCE_QUERY_LENGTH) return 0

  const span = subsequenceSpan(text, query)
  if (span === null) return 0
  // Tightest possible span is the query's own length, which scores full
  // subsequence credit; anything looser decays toward zero.
  return SUBSEQUENCE_MAX * (query.length / span)
}

function scoreActivity(activity: ActivityDefinition, query: string): number {
  const fields: Array<[string, number]> = [
    [activity.name, FIELD_WEIGHT.name],
    [activity.description, FIELD_WEIGHT.description],
    [activity.audio?.blurb ?? "", FIELD_WEIGHT.blurb],
  ]

  let best = 0
  for (const [text, weight] of fields) {
    const score = weight * matchQuality(text.toLowerCase(), query)
    if (score > best) best = score
  }
  return best
}

export type SearchOptions = {
  /** `m` - how many results to return. Defaults to `SEARCH_RESULT_LIMIT`. */
  limit?: number
}

/**
 * The `m` best fuzzy matches for `query`, over name, description and the
 * activity's audio blurb.
 *
 * **Pass a ranked catalogue.** Equal-scoring matches come back in the order
 * they arrived, so handing this the output of `rankActivities` makes the
 * recommendation order the tie-break for free - which is what the epic asks
 * for and needs no second sort key here.
 *
 * An empty or whitespace-only query returns nothing rather than everything.
 * "No query" is not a search for all activities; it is the state the launcher
 * shows its recommendations in, and returning `N` results here would hand the
 * overlay the unbounded list this epic exists to avoid.
 */
export function searchActivities(
  catalogue: ReadonlyArray<ActivityDefinition>,
  query: string,
  { limit = SEARCH_RESULT_LIMIT }: SearchOptions = {}
): Array<ActivityDefinition> {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return []
  if (!Number.isFinite(limit) || limit <= 0) return []

  const scored = catalogue
    .map((activity, index) => ({
      activity,
      index,
      score: scoreActivity(activity, needle),
    }))
    .filter(({ score }) => score >= MIN_SCORE)

  scored.sort((a, b) => b.score - a.score || a.index - b.index)

  return scored.slice(0, Math.floor(limit)).map(({ activity }) => activity)
}
