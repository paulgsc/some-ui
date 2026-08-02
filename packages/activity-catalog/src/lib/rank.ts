import type {
  ActivityDefinition,
  ActivityMaturity,
  TopikLevel,
} from "./types"

/**
 * One past play of one activity. Deliberately not a `SessionRecord`: ranking
 * needs "this activity, at this time" and nothing else, and taking the whole
 * record would tie this module to the tenant store's shape for no gain.
 */
export type ActivityPlay = {
  activityId: string
  /** ms since the epoch, as `Date.parse` of a session's `updatedAt` gives. */
  at: number
}

export type RankingSignals = {
  /** Every play the app already knows about, in any order. */
  history?: ReadonlyArray<ActivityPlay>
  /** The profile's `targetTopikLevel`, when there is a profile. */
  targetLevel?: TopikLevel
  /** Injectable clock, so recency is testable without freezing time globally. */
  now?: number
}

/**
 * Signal weights, in the order the epic states them: recency first, then
 * frequency, then whether the activity meets the person where their profile
 * says they are, then how finished it is.
 *
 * These are ordered, not tuned. The gaps are wide enough that a signal can
 * never be outvoted by the sum of the ones below it, which is what makes the
 * ordering an actual ordering rather than four numbers that happen to be
 * different - and it means a ranking change is a change to *this block*, not
 * an emergent surprise.
 */
const WEIGHT_RECENCY = 8
const WEIGHT_FREQUENCY = 4
const WEIGHT_LEVEL = 2
const WEIGHT_MATURITY = 1

/**
 * How fast "recently played" stops meaning anything. A week: long enough that
 * a daily habit keeps its place at the top, short enough that a thing you
 * tried once last month stops crowding out the rest.
 */
const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A construction zone is a poor thing to recommend, but it is not a thing to
 * hide either - `early` still ranks, just below everything finished.
 */
const MATURITY_SCORE: Record<ActivityMaturity, number> = {
  ready: 1,
  preview: 0.6,
  early: 0.2,
}

/** Absent `maturity` means `"ready"` - the quiet default (see types.ts). */
function maturityScore(activity: ActivityDefinition): number {
  return MATURITY_SCORE[activity.maturity ?? "ready"]
}

/**
 * Does this activity meet the person where their profile says they are?
 *
 * Read off `fields` rather than off a dedicated `level` property because
 * that is where the truth already is: an activity that offers levels has a
 * `select` field keyed `level`, and one that doesn't isn't level-shaped at
 * all. Full credit when the activity would *default* to the target level
 * (they can press play and be at the right level), half when it merely
 * offers it (one dropdown away).
 */
function levelScore(
  activity: ActivityDefinition,
  targetLevel: TopikLevel | undefined
): number {
  if (targetLevel === undefined) return 0

  for (const field of activity.fields) {
    if (field.kind !== "select" || field.key !== "level") continue
    if (!field.options.some((option) => option.value === targetLevel)) return 0
    return activity.defaultConfig.level === targetLevel ? 1 : 0.5
  }
  return 0
}

type HistorySummary = {
  lastPlayedAt: Map<string, number>
  playCount: Map<string, number>
  maxPlayCount: number
}

function summarize(history: ReadonlyArray<ActivityPlay>): HistorySummary {
  const lastPlayedAt = new Map<string, number>()
  const playCount = new Map<string, number>()

  for (const play of history) {
    const previous = lastPlayedAt.get(play.activityId)
    if (previous === undefined || play.at > previous) {
      lastPlayedAt.set(play.activityId, play.at)
    }
    playCount.set(play.activityId, (playCount.get(play.activityId) ?? 0) + 1)
  }

  let maxPlayCount = 0
  for (const count of playCount.values()) {
    if (count > maxPlayCount) maxPlayCount = count
  }

  return { lastPlayedAt, playCount, maxPlayCount }
}

/**
 * Exponential decay on how long ago the last play was, normalized to 0-1.
 *
 * Clamped at both ends: a play stamped in the future (a clock skew, an
 * imported record) scores 1 rather than blowing past every other signal,
 * and never-played scores 0 rather than -Infinity.
 */
function recencyScore(lastPlayedAt: number | undefined, now: number): number {
  if (lastPlayedAt === undefined) return 0
  const age = Math.max(0, now - lastPlayedAt)
  return 2 ** (-age / RECENCY_HALF_LIFE_MS)
}

export type RankedActivity = {
  activity: ActivityDefinition
  score: number
}

/**
 * Orders the catalogue by how likely a person is to want each activity next.
 *
 * Pure and total: same catalogue and same signals give the same order, every
 * time. That is not incidental - the launcher re-renders on every session
 * mutation, and a set that reshuffles under someone mid-click is worse than
 * a set that is merely imperfect.
 *
 * Ties break on catalogue position, which is authored and stable. A person
 * with no history at all therefore gets the finished activities in catalogue
 * order rather than something that looks random and changes on reload.
 */
export function rankActivitiesWithScores(
  catalogue: ReadonlyArray<ActivityDefinition>,
  { history = [], targetLevel, now = Date.now() }: RankingSignals = {}
): Array<RankedActivity> {
  const { lastPlayedAt, playCount, maxPlayCount } = summarize(history)

  const scored = catalogue.map((activity, index) => {
    const plays = playCount.get(activity.id) ?? 0
    const frequency = maxPlayCount > 0 ? plays / maxPlayCount : 0

    const score =
      WEIGHT_RECENCY * recencyScore(lastPlayedAt.get(activity.id), now) +
      WEIGHT_FREQUENCY * frequency +
      WEIGHT_LEVEL * levelScore(activity, targetLevel) +
      WEIGHT_MATURITY * maturityScore(activity)

    return { activity, score, index }
  })

  // Sort by score, then by authored position. Both keys are compared
  // explicitly rather than leaning on sort stability, so the order does not
  // depend on the engine's implementation of `Array#sort`.
  scored.sort((a, b) => b.score - a.score || a.index - b.index)

  return scored.map(({ activity, score }) => ({ activity, score }))
}

/** `rankActivitiesWithScores` without the scores, which is what callers want. */
export function rankActivities(
  catalogue: ReadonlyArray<ActivityDefinition>,
  signals: RankingSignals = {}
): Array<ActivityDefinition> {
  return rankActivitiesWithScores(catalogue, signals).map(
    ({ activity }) => activity
  )
}

/**
 * The `k` best, for a launcher that renders `k` and no more.
 *
 * `k` comes from the box (see `recommendedCount`), so this clamps rather than
 * assuming: `k` larger than the catalogue yields the whole catalogue, and a
 * nonsensical `k` yields nothing rather than throwing at render time.
 */
export function pickRecommended(
  catalogue: ReadonlyArray<ActivityDefinition>,
  k: number,
  signals: RankingSignals = {}
): Array<ActivityDefinition> {
  if (!Number.isFinite(k) || k <= 0) return []
  return rankActivities(catalogue, signals).slice(0, Math.floor(k))
}
