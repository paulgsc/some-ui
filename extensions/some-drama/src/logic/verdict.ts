// ── Verdicts ──────────────────────────────────────────────────────────────────
// Rating and likelihood to finish: their ranges, their steps, and how a change
// from a hotkey or the card lands on them. Pure — the background applies it
// inside its write queue, so two quick presses step twice instead of racing.

import type { VerdictChange, VerdictField } from "@drama/types"

type Range = { min: number; max: number; step: number }

const VERDICT_RANGE: Record<VerdictField, Range> = {
  rating: { min: 0, max: 10, step: 0.5 },
  completionLikelihood: { min: 0, max: 1, step: 0.1 },
}

/** The finish choices the card offers, one per likelihoodLabel bucket. */
export const FINISH_CHOICES: ReadonlyArray<number> = [0.2, 0.5, 0.7, 0.9]

/** The rating each of the card's five stars sets. */
export const STAR_RATINGS: ReadonlyArray<number> = [2, 4, 6, 8, 10]

// Float noise from repeated tenths (0.1 * 7 = 0.7000000000000001) would
// otherwise leak into storage and into the "70%" the card prints.
const tidy = (v: number): number => Math.round(v * 1000) / 1000

/**
 * The value `change` makes of `current`. A step moves to the next grid point
 * in its direction, so an off-grid value typed into the popup (7.3) steps to
 * 7.5 or 7, never past one. Always clamped to the field's range.
 */
export function applyVerdict(
  current: number,
  field: VerdictField,
  change: VerdictChange
): number {
  const { min, max, step } = VERDICT_RANGE[field]
  let next: number
  if ("set" in change) {
    next = change.set
  } else {
    const at = tidy(current / step)
    const from = change.step > 0 ? Math.floor(at) : Math.ceil(at)
    next = (from + change.step) * step
  }
  return tidy(Math.min(max, Math.max(min, next)))
}

export function isVerdictField(v: unknown): v is VerdictField {
  return v === "rating" || v === "completionLikelihood"
}

export function isVerdictChange(v: unknown): v is VerdictChange {
  if (typeof v !== "object" || v === null) return false
  if ("set" in v) return typeof v.set === "number" && Number.isFinite(v.set)
  if ("step" in v) return v.step === 1 || v.step === -1
  return false
}
