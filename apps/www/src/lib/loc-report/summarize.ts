/**
 * What the widget shows, computed from a snapshot: pure functions, no clock.
 * Every range ends on the snapshot's last day (`through`), never today; the
 * footer dates it ("as of Sep 12").
 */

import { addDays } from "@some-ui/core-utils"

import type { LocSnapshot } from "./schema.ts"

/**
 * The ranges the widget offers. `buckets` is how many bars each draws, and
 * divides `days` evenly, so a bar is a whole number of days. All fit twice
 * inside `WINDOW_DAYS`: the range and the one before it, for the comparison.
 */
export const RANGES = [
  { key: "7d", days: 7, buckets: 7 },
  { key: "30d", days: 30, buckets: 10 },
  { key: "90d", days: 90, buckets: 9 },
] as const

export type RangeKey = (typeof RANGES)[number]["key"]

type Bucket = {
  /** First and last day the bar covers, `YYYY-MM-DD`. */
  from: string
  to: string
  added: number
  removed: number
}

export type Summary = {
  from: string
  to: string
  added: number
  removed: number
  net: number
  previousAdded: number
  /** Against the same number of days before; `null` when there was nothing to compare with. */
  deltaPercent: number | null
  buckets: ReadonlyArray<Bucket>
  /** Added lines per repository, in the snapshot's order. */
  repos: ReadonlyArray<{ repo: string; added: number }>
}

export function summarize(
  snapshot: LocSnapshot,
  key: RangeKey,
  includeGenerated: boolean
): Summary {
  const range = RANGES.find((candidate) => candidate.key === key) ?? RANGES[0]
  const index = new Map(snapshot.days.map((day) => [day.date, day.repos]))

  const lines = (
    date: string
  ): { added: number; removed: number; byRepo: Map<string, number> } => {
    const byRepo = new Map<string, number>()
    let added = 0
    let removed = 0
    for (const [repo, day] of Object.entries(index.get(date) ?? {})) {
      const repoAdded = day.add + (includeGenerated ? day.genAdd : 0)
      added += repoAdded
      removed += day.del + (includeGenerated ? day.genDel : 0)
      byRepo.set(repo, repoAdded)
    }
    return { added, removed, byRepo }
  }

  const from = addDays(snapshot.through, -(range.days - 1))
  const size = range.days / range.buckets
  const repoTotals = new Map(snapshot.repos.map((repo) => [repo, 0]))
  const buckets: Array<Bucket> = []
  for (let bucket = 0; bucket < range.buckets; bucket += 1) {
    const first = addDays(from, bucket * size)
    let added = 0
    let removed = 0
    for (let offset = 0; offset < size; offset += 1) {
      const day = lines(addDays(first, offset))
      added += day.added
      removed += day.removed
      for (const [repo, repoAdded] of day.byRepo) {
        repoTotals.set(repo, (repoTotals.get(repo) ?? 0) + repoAdded)
      }
    }
    buckets.push({ from: first, to: addDays(first, size - 1), added, removed })
  }

  const added = buckets.reduce((total, bucket) => total + bucket.added, 0)
  const removed = buckets.reduce((total, bucket) => total + bucket.removed, 0)
  const previousFrom = addDays(from, -range.days)
  let previousAdded = 0
  for (let offset = 0; offset < range.days; offset += 1) {
    previousAdded += lines(addDays(previousFrom, offset)).added
  }

  return {
    from,
    to: snapshot.through,
    added,
    removed,
    net: added - removed,
    previousAdded,
    deltaPercent:
      previousAdded > 0
        ? Math.round(((added - previousAdded) / previousAdded) * 100)
        : null,
    buckets,
    repos: [...repoTotals].map(([repo, repoAdded]) => ({
      repo,
      added: repoAdded,
    })),
  }
}

/** 2431 as "2.4k", 612 as "612". */
export function compactCount(count: number): string {
  if (count < 1000) return String(count)
  return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`
}
