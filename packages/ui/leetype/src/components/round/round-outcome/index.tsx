import type { FC } from "react"
import { CommitmentControl } from "@leetype/components/round/commitment-control"
import { RoundChoices } from "@leetype/components/round/round-choices"
import { RoundFeedback } from "@leetype/components/round/round-feedback"
import { isAdmissible } from "@leetype/lib/leetype/admissibility"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type {
  RescueCandidate,
  RoundCycleState,
} from "@leetype/lib/leetype/round-cycle"
import { roundProbeOf } from "@leetype/lib/leetype/round-probe"
import type { Budget, ConstraintSet } from "@leetype/types/constraint"
import { cn } from "@some-ui/core-utils"
import { Check, X } from "lucide-react"

/** `n ≤ 1,000 · m ≤ 100,000`: a bound set as one line, the way `ConstraintDiff` writes a row. */
function constraintLabel(constraints: ConstraintSet): string {
  const symbol: Record<string, string> = { "<=": "≤", ">=": "≥" }
  return constraints
    .map(
      (constraint) =>
        `${constraint.dimension} ${symbol[constraint.operator] ?? constraint.operator} ${constraint.bound.toLocaleString("en-US")}`
    )
    .join(" · ")
}

type RoundOutcomeProps = {
  /** The cycle's state after the learner's `(d, p)`: never `posingDiffSelection` (Thm. 8.1). */
  state: Exclude<RoundCycleState, { phase: "posingDiffSelection" }>
  /** Seeds the fallback question's option order. */
  seed: number
  className?: string
}

/** Whether a rescue candidate `C″` actually makes the pinned diff fit. Derived, never authored (Def. 8.2). */
function rescues(
  candidate: RescueCandidate,
  graph: Parameters<typeof isAdmissible>[0],
  budget: Budget
): boolean {
  try {
    return isAdmissible(graph, candidate.constraints, budget)
  } catch {
    return false
  }
}

/**
 * What Def. 8.1/8.2 say happens after the learner's pair `(d, p)`, drawn as
 * the question the cycle poses next:
 *
 * - **Case 3, the diff fits.** Nothing further is asked this round.
 * - **Def. 8.2 case 1, a bound change would rescue it.** The learner picks
 *   which `C″` (one tap, abstention allowed), then sees which candidates
 *   actually fit and the proposition explaining why.
 * - **Def. 8.2 case 2, nothing rescues it.** The learner names the
 *   proposition that explains why (`explanationPropositionId`).
 *
 * Every follow-up is optional in the sense Ax. 9.1 requires: the session's
 * "Next round" is available the moment `(d, p)` is committed, so a learner
 * who is wrong is never held here.
 */
export const RoundOutcome: FC<RoundOutcomeProps> = ({
  state,
  seed,
  className,
}) => {
  if (state.phase === "admissibleAdvance") {
    return (
      <p
        role="status"
        className={cn(
          "flex items-center gap-2 text-sm text-emerald-400",
          className
        )}
      >
        <Check className="size-4" aria-hidden="true" />
        This rewrite fits the budget at the new bounds.
      </p>
    )
  }

  if (state.phase === "posingRescueSelection") {
    const candidates = state.rescueCandidates
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <p className="text-pretty text-sm text-muted-foreground">
          This rewrite does not fit at these bounds. Under which bounds would it
          fit?
        </p>
        <CommitmentControl
          groupLabel="Under which bounds would it fit?"
          options={candidates.map((candidate, index) => ({
            id: String(index),
            label: constraintLabel(candidate.constraints),
          }))}
          onCommit={() => {}}
          reveal={
            <ul className="flex flex-col gap-2">
              {candidates.map((candidate) => {
                const fits = rescues(
                  candidate,
                  state.pinnedDiff.graph,
                  state.budget
                )
                return (
                  <li
                    key={`${constraintLabel(candidate.constraints)}:${candidate.propositionId}`}
                    className="flex flex-col gap-1 text-sm text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      {fits ? (
                        <Check
                          className="size-4 text-emerald-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <X
                          className="size-4 text-rose-400"
                          aria-hidden="true"
                        />
                      )}
                      {constraintLabel(candidate.constraints)}:{" "}
                      {fits ? "fits" : "still too slow"}
                    </span>
                    {fits && (
                      <RoundFeedback
                        justification={
                          PROPOSITION_REGISTER[candidate.propositionId]
                            .statement
                        }
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          }
        />
      </div>
    )
  }

  // Only the answer id matters to this card: `RoundChoices` shows the
  // options and verdict, never the gloss `roundProbeOf` carries through.
  const probe = roundProbeOf(
    {
      ...state.pinnedDiff.member,
      propositionId: state.explanationPropositionId,
    },
    seed
  )
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p className="text-pretty text-sm text-muted-foreground">
        This rewrite does not fit, and no change of bounds would make it fit.
      </p>
      <RoundChoices
        prompt="Which proposition explains why?"
        options={probe.options}
        answerId={probe.answerId}
        onCommit={() => {}}
      />
    </div>
  )
}
