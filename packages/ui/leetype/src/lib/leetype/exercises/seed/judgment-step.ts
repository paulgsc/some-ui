import type { ConstructionStep } from "@leetype/types/exercise"

/**
 * A construction step's obligation, plus the three fields v1.3 of the
 * exercise-generator prompt requires alongside it (`packages/some-content
 * /prompts/leetype-exercise-generator/index.md`'s "Construction (obligation
 * → witness)" section): a canonical decision that bottoms out in a
 * property, a realistic constraint under which the rejected candidate
 * would become preferable, and the surface-level pattern-match a learner
 * could get away with instead of deriving either.
 */
export type JudgmentStep = ConstructionStep & {
  decisionReason: string
  counterfactual: string
  surfaceRule: string
}

/**
 * Folds `JudgmentStep`'s three extra fields into a plain `ConstructionStep`:
 * `obligation` gains a `Decision`/`Boundary` clause, and `rationaleChoices`
 * gets the canonical property-grounded reason plus two rejected candidates —
 * one modeling cargo-cult technique matching, one applying the chosen design
 * past the counterfactual that should have reversed it.
 *
 * Shared rather than redefined per seed module: originally local to
 * `lexicographically-smallest-valid-sequence.ts`, moved here once
 * `entry-api.ts`, `lazy-default.ts` and `binary-search-place.ts` needed the
 * identical wrapper to bring their own construction steps up to the same
 * invariant.
 */
export function withJudgment({
  decisionReason,
  counterfactual,
  surfaceRule,
  ...value
}: JudgmentStep): ConstructionStep {
  return {
    ...value,
    obligation: `${value.obligation}. Decision: ${decisionReason}. Boundary: ${counterfactual}`,
    rationaleChoices: [
      { text: decisionReason, canonical: true },
      { text: surfaceRule },
      { text: `Always keep this design, even if ${counterfactual}` },
    ],
  }
}
