/**
 * Human eye-score schema (#728) — the independent oracle #730's Playwright
 * regression checks the classifier against. Deliberately not scientific
 * (per #726's own framing): the four sub-scores exist to make a reviewer
 * articulate *why*, not because they are independently load-bearing — only
 * `overall` is ever compared against the classifier's verdict.
 *
 * `0 = painful`, `100 = effortless`.
 */

import type { CorpusFixture } from "./corpus"

export type EyeScore = {
  readonly luminanceComfort: number
  readonly contrastComfort: number
  readonly colorComfort: number
  readonly emotionalComfort: number
  /** The number #730 actually gates on. Derived, not independently set — see `computeOverall`. */
  readonly overall: number
  readonly reviewer: string
  readonly notes: string
  /** ISO timestamp. */
  readonly scoredAt: string
}

const SUB_SCORE_KEYS = [
  "luminanceComfort",
  "contrastComfort",
  "colorComfort",
  "emotionalComfort",
] as const

export type EyeSubScores = Pick<EyeScore, (typeof SUB_SCORE_KEYS)[number]>

const SCORE_MIN = 0
const SCORE_MAX = 100

/**
 * `overall` = the mean of the four sub-scores, rounded. Kept derived rather
 * than a fifth independently-set slider so it can never silently drift from
 * the scores that are supposed to justify it — the guide doc's own warning
 * against making this "too scientific" cuts both ways: no formula more
 * elaborate than a mean, but also no back door around the sub-scores.
 */
export function computeOverall(subScores: EyeSubScores): number {
  const sum = SUB_SCORE_KEYS.reduce((total, key) => total + subScores[key], 0)
  return Math.round(sum / SUB_SCORE_KEYS.length)
}

export function isValidScore(value: number): boolean {
  return Number.isFinite(value) && value >= SCORE_MIN && value <= SCORE_MAX
}

/**
 * Thresholds #730's Playwright oracle regression enforces against. Defined
 * here, not there, so Story 2's own "notes required on disagreement" check
 * and Story 4's classifier-boundary check can never drift apart from using
 * two different boundaries for the same word "comfortable."
 */
export const EYE_SCORE_COMFORTABLE_THRESHOLD = 60
export const EYE_SCORE_HOSTILE_THRESHOLD = 40

export type EyeScoreVerdict = "comfortable" | "hostile" | "borderline"

export function eyeScoreVerdict(overall: number): EyeScoreVerdict {
  if (overall >= EYE_SCORE_COMFORTABLE_THRESHOLD) return "comfortable"
  if (overall <= EYE_SCORE_HOSTILE_THRESHOLD) return "hostile"
  return "borderline"
}

/**
 * True when a human's score contradicts the fixture's own hand-verified
 * `expectComfortable` (#724) — a disagreement the reviewer must explain, not
 * silently record. A borderline verdict is not a disagreement (it's the
 * declared gray zone #730 exempts from enforcement), so it's excluded here
 * too — the same boundary governs both what counts as a foreseen
 * disagreement and what #730 later gates on.
 */
export function requiresExplanation(
  fixture: CorpusFixture,
  score: Pick<EyeScore, "overall">
): boolean {
  if (fixture.expectComfortable === null) return false

  const verdict = eyeScoreVerdict(score.overall)
  if (verdict === "borderline") return false

  const humanSaysComfortable = verdict === "comfortable"
  return humanSaysComfortable !== fixture.expectComfortable
}

/** Validation issues for a candidate `EyeScore`, empty when it's ready to save. */
export function validateEyeScore(
  fixture: CorpusFixture,
  score: EyeScore
): ReadonlyArray<string> {
  const issues: Array<string> = []

  for (const key of [...SUB_SCORE_KEYS, "overall"] as const) {
    if (!isValidScore(score[key])) {
      issues.push(
        `${key} must be a number between ${SCORE_MIN} and ${SCORE_MAX}`
      )
    }
  }

  if (score.reviewer.trim().length === 0) {
    issues.push("reviewer must not be empty")
  }

  if (requiresExplanation(fixture, score) && score.notes.trim().length === 0) {
    issues.push(
      `notes must explain why this score (${eyeScoreVerdict(score.overall)}) ` +
        `disagrees with the fixture's own expectComfortable=${String(fixture.expectComfortable)}`
    )
  }

  return issues
}

/** Keyed by fixture id — the shape `eye-scores.json` (#729) will commit. */
export type EyeScoreMap = Readonly<Record<string, EyeScore>>

export type OracleAgreement = {
  readonly agrees: boolean
  readonly reason: string
}

/**
 * The predicate #730's Playwright oracle regression gates on: does the
 * classifier's real (boolean) comfort verdict land on the same side of the
 * human's score as `eyeScoreVerdict` says it should? Reuses the same
 * threshold constants `requiresExplanation` checks against, so "disagrees"
 * means the same thing in both places. A borderline eye score never
 * disagrees — see `eyeScoreVerdict`'s own comfortable/hostile boundary.
 */
export function checkOracleAgreement(
  eyeScoreOverall: number,
  classifierComfortable: boolean
): OracleAgreement {
  const verdict = eyeScoreVerdict(eyeScoreOverall)

  if (verdict === "borderline") {
    return {
      agrees: true,
      reason: `eye score ${eyeScoreOverall} is borderline — exempt from enforcement`,
    }
  }

  const humanSaysComfortable = verdict === "comfortable"
  const agrees = humanSaysComfortable === classifierComfortable

  return {
    agrees,
    reason: agrees
      ? `eye score ${eyeScoreOverall} (${verdict}) agrees with classifier comfortable=${String(classifierComfortable)}`
      : `eye score ${eyeScoreOverall} (${verdict}) disagrees with classifier comfortable=${String(classifierComfortable)}`,
  }
}
