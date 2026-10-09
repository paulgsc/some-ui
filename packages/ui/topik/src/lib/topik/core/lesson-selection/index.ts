/** What a lesson's manifest entry says about its level. Pure and total. */

/** A lesson's level tag: `topik-1` … `topik-6`. */
const LEVEL_TAG = /^topik-([1-6])$/

/** The TOPIK level a lesson's tags carry, if any. */
export function topikLevelOf(tags: Array<string> = []): number | undefined {
  for (const tag of tags) {
    const match = LEVEL_TAG.exec(tag)
    if (match) return Number(match[1])
  }
  return undefined
}
