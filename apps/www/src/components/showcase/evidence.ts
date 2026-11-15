/** Pure evidence helpers shared by the build-time reader and its tests. */
export const SOURCE_ROOT = "https://github.com/paulgsc/some-ui"
const SOURCE_REVISION = "78519a76"
export const sourceUrl = (path: string): string =>
  `${SOURCE_ROOT}/blob/${SOURCE_REVISION}/${path}`

export function excerpt(source: string, first: string, last: string): string {
  const start = source.indexOf(first)
  const end = source.indexOf(last, start)
  if (start < 0 || end < 0)
    throw new Error(`Missing showcase excerpt: ${first}`)
  return source.slice(start, end + last.length)
}

export function verdicts(
  families: ReadonlyArray<{ objectives: ReadonlyArray<{ verdict: string }> }>
): {
  total: number
  holds: number
  other: number
} {
  const objectives = families.flatMap((family) => family.objectives)
  const holds = objectives.filter(
    (objective) => objective.verdict === "holds"
  ).length
  return { total: objectives.length, holds, other: objectives.length - holds }
}
