/**
 * The cycle's failure branch (LTY-PROBE B4): canon Def. 8.1, Def. 8.2,
 * Thm. 8.1, Rem. 8.0, Rem. 8.1, Rem. 8.2, Prop. 8.1.
 *
 * A pure reducer over one round's transition (Def. 8.1) and its failure
 * successor (Def. 8.2). The branch is always the *derived* relation
 * `isAdmissible` over a cost graph, never a run result: branching on `r`
 * ("r = ok, therefore A is admissible") is the inference Cor. 4.1 forbids
 * (Rem. 8.0), so `RunResult` does not appear here by construction.
 *
 * Engine-free: no wasm loader, no hook. Its one live importer is
 * `lib/leetype/round-assembly`.
 */

import { isAdmissible } from "@leetype/lib/leetype/admissibility"
import { dimensionsOfConstraints } from "@leetype/lib/leetype/constraint"
import type { CostGraph, Dimension } from "@leetype/lib/leetype/cost"
import { costOf, dimensionsOfMonomial } from "@leetype/lib/leetype/cost"
import { PROPOSITION_REGISTER } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import type { PropositionRegisterEntry } from "@leetype/lib/leetype/proposition-register/parse-canon"
import type { Commitment } from "@leetype/types/commitment"
import type { Budget, ConstraintSet } from "@leetype/types/constraint"
import { ConstraintDiffSchema } from "@leetype/types/constraint"
import type { DiffSetMember } from "@leetype/types/round"

/**
 * A candidate rescuing constraint set `C″` (Def. 8.2, case 1): "some
 * constraint set, over the same dimensions, with `T_{A+d}(C″) <= B`."
 * `propositionId` is the authored register entry explaining *why* this `C″`
 * rescues (Ax. 6.1). Whether it actually rescues is checked, never authored
 * (`nextRoundCycleState`).
 *
 * `constraints` must be a valid Def. 3.2 constraint diff from `C` (same
 * dimensions and operators, at least one bound differing).
 * `nextRoundCycleState` validates every candidate against
 * `ConstraintDiffSchema` before evaluating any, since `evaluate` throws on an
 * unbounded dimension and a mismatched candidate could not be presented.
 */
export type RescueCandidate = {
  readonly constraints: ConstraintSet
  readonly propositionId: PropositionId
}

/**
 * One member of `D`, with the authored data Def. 8.2 needs the instant this
 * diff is selected and fails to restore admissibility:
 *
 * - `graph` is `G_{A+d}` (Thm. 5.1, `rewriteOf`), what `isAdmissible`
 *   evaluates. Never `member.admissible`, an independent authored claim.
 * - `rescueCandidates` are Def. 8.2 case 1's candidate `C″`s, the *only*
 *   way `nextRoundCycleState` decides whether a rescue exists (see there).
 *   May be empty (e.g. `CW-P16`'s shape); this module cannot catch an author
 *   who should have authored a working candidate and didn't.
 * - `explanationPropositionId` is Def. 8.2 case 2's fallback: the entry to
 *   name when no candidate rescues. Always present, since Thm. 8.1's
 *   totality is about the transition function; `checkUnrescuableExplanationsResolve`
 *   lints that it resolves.
 */
export type RoundDiffOption = {
  readonly member: DiffSetMember
  readonly graph: CostGraph
  readonly rescueCandidates: ReadonlyArray<RescueCandidate>
  readonly explanationPropositionId: PropositionId
}

/**
 * Def. 8.1 case 2: `T_A(C) > B`. `D` is presented and the learner selects a
 * pair `(d, p)`, `d` from `diffOptions`. `p` is not modeled here because
 * Def. 8.1's branch never reads it.
 */
export type RoundCyclePosingDiffSelection = {
  readonly phase: "posingDiffSelection"
  readonly graph: CostGraph
  readonly constraints: ConstraintSet
  readonly budget: Budget
  readonly diffOptions: ReadonlyArray<RoundDiffOption>
}

/**
 * The successor of Def. 8.1 cases 1 and 3: `A` (possibly `A+d`) is
 * admissible under `C`; the next round diffs the constraint (`C -> C'`) and
 * poses Prop. 4.2's anticipation task. Choosing `C'` and the next round is
 * the sampler's job, so this carries only the graph, constraints and budget.
 */
export type RoundCycleAdmissibleAdvance = {
  readonly phase: "admissibleAdvance"
  readonly graph: CostGraph
  readonly constraints: ConstraintSet
  readonly budget: Budget
}

/**
 * Def. 8.2, case 1: a rescuing `C″` exists. `(d, p)` is held fixed
 * (`pinnedDiff`, `pinnedCommitment`); the next question is `(c, p)`: which
 * constraint diff, and the proposition explaining why it works.
 * `pinnedCommitment` is carried so a surface can show what the question
 * builds on (an abstention and a guess must stay distinguishable), never
 * read to pick the branch. `rescueCandidates` is unfiltered: distractor
 * `C″`s included, like `D` itself.
 */
export type RoundCyclePosingRescueSelection = {
  readonly phase: "posingRescueSelection"
  readonly graph: CostGraph
  readonly constraints: ConstraintSet
  readonly budget: Budget
  readonly pinnedDiff: RoundDiffOption
  readonly pinnedCommitment: Commitment
  readonly rescueCandidates: ReadonlyArray<RescueCandidate>
}

/**
 * Def. 8.2, case 2: no rescuing `C″` exists. `(d, p)` is held fixed (as in
 * `RoundCyclePosingRescueSelection`); the next question is `(d, p')`: name
 * *why* no constraint rescues it (Rem. 8.1: "a strictly different failure
 * kind from 'too slow at this size'").
 */
export type RoundCyclePosingUnrescuableExplanation = {
  readonly phase: "posingUnrescuableExplanation"
  readonly graph: CostGraph
  readonly constraints: ConstraintSet
  readonly budget: Budget
  readonly pinnedDiff: RoundDiffOption
  readonly pinnedCommitment: Commitment
  readonly explanationPropositionId: PropositionId
}

/**
 * Def. 1.7's round tuple, cut down to what Def. 8.1/8.2 branch on: no `r`
 * (Rem. 8.0), and no win state, completion fraction or exhausted-corpus
 * condition, so Prop. 8.1 is a fact about the type. One variant per
 * successor named in Thm. 8.1's proof.
 */
export type RoundCycleState =
  | RoundCyclePosingDiffSelection
  | RoundCycleAdmissibleAdvance
  | RoundCyclePosingRescueSelection
  | RoundCyclePosingUnrescuableExplanation

/**
 * Def. 8.1's entry point: is `A` admissible under `C` at all? Classifies a
 * fresh round before any learner action, so it takes no prior state.
 */
export function initialRoundCycleState(
  graph: CostGraph,
  constraints: ConstraintSet,
  budget: Budget,
  diffOptions: ReadonlyArray<RoundDiffOption>
): RoundCycleAdmissibleAdvance | RoundCyclePosingDiffSelection {
  if (isAdmissible(graph, constraints, budget)) {
    return { phase: "admissibleAdvance", graph, constraints, budget }
  }
  return {
    phase: "posingDiffSelection",
    graph,
    constraints,
    budget,
    diffOptions,
  }
}

/**
 * The action `nextRoundCycleState` reduces over: the selected `d` paired
 * with the proposition guess `p` (`commitment`, Def. 9.1). `commitment` is
 * here because Def. 8.1 calls the selection a pair; the reducer never
 * branches on it.
 */
export type RoundCycleResponse = {
  readonly kind: "selectDiff"
  readonly diff: RoundDiffOption
  readonly commitment: Commitment
}

/**
 * Every dimension a graph's *computed* cost references: `costOf(graph)`'s
 * surviving terms, not the raw structure. `Loop(dim("m"), W(0))` repeats
 * over `m` but contributes nothing to `T(G)` (zero terms are dropped), so a
 * structural walk would flag `m` as unbounded and misroute an admissible
 * diff to Def. 8.2 case 2.
 */
function dimensionsOfCost(graph: CostGraph): ReadonlySet<Dimension> {
  const dimensions = new Set<Dimension>()
  for (const term of costOf(graph)) {
    for (const dimension of dimensionsOfMonomial(term.monomial)) {
      dimensions.add(dimension)
    }
  }
  return dimensions
}

/**
 * A rescue candidate is meaningful only as the constraint diff `C -> C″`
 * the next round presents, so it is held to `ConstraintDiffSchema` itself:
 * same dimensions, same operators (`isAdmissible` reads only the number, so
 * `n <= 1000` → `n >= 400` would otherwise pass), at least one bound
 * differing.
 */
function invalidRescueCandidateReason(
  constraints: ConstraintSet,
  candidate: RescueCandidate
): string | undefined {
  const result = ConstraintDiffSchema.safeParse({
    before: constraints,
    after: candidate.constraints,
  })
  return result.success
    ? undefined
    : result.error.issues.map((issue) => issue.message).join("; ")
}

/**
 * Def. 8.1 cases 3/4, and Def. 8.2's two cases when case 4 fires: the pure
 * reducer `(round, response) -> round`. `round` must be
 * `posingDiffSelection`; every other phase is already a successor.
 *
 * Neither `response.commitment` (carried, unread, into `pinnedCommitment`)
 * nor `response.diff.member.admissible` (the author's claim) picks a branch.
 * Def. 8.1 branches purely on the derived `T_{A+d}(C) <= B`; branching on
 * the guess or the claim is Rem. 8.0's mistake one level up. Scoring the
 * guess is `RoundFeedback`'s job; this decides which *question* comes next.
 *
 * `response.diff` must be one of `round.diffOptions`' own objects, checked
 * by reference identity: the transition is over a selection *from the
 * presented D*, so a stale or miswired caller cannot advance on data the
 * learner never saw. Callers pass back the literal element picked.
 *
 * A diff whose cost references a dimension `C` does not bound goes straight
 * to Def. 8.2 case 2 (its second disjunct, "grows in a dimension C does not
 * bound"): `T_{A+d}(C)` is undefined (Def. 3.1), and no same-dimension
 * constraint diff could bound it. "References" means `dimensionsOfCost`.
 *
 * Otherwise case 1 vs. 2 is decided by testing every authored
 * `rescueCandidate` against `isAdmissible`, never by reasoning over the
 * graph's algebra alone. This algebra allows a bound below 1 and negative
 * terms (`log₂` of a fraction), so bound-independent arguments fail:
 * `Seq(Loop(dim("n", 2), W(1)), Loop(logDim("n", 2), W(1)))` and
 * `Seq(W(2), Loop(logDim("n"), W(2)))` each refuted one. Whether the corpus
 * authored a rescuing candidate for every diff that has one is a disclosed
 * limitation, like `round-probe`'s gap on Prop. 6.1.
 *
 * The return type excludes `RoundCyclePosingDiffSelection`: Thm. 8.1's "no
 * learner response returns the cycle to a state already visited," checked
 * by the compiler.
 */
export function nextRoundCycleState(
  round: RoundCyclePosingDiffSelection,
  response: RoundCycleResponse
):
  | RoundCycleAdmissibleAdvance
  | RoundCyclePosingRescueSelection
  | RoundCyclePosingUnrescuableExplanation {
  const { diff, commitment } = response

  if (!round.diffOptions.includes(diff)) {
    throw new Error(
      "nextRoundCycleState: response.diff is not one of this round's own diffOptions — Def. 8.1 case 2 defines this transition over a selection from the presented D."
    )
  }

  const constraintDimensions = dimensionsOfConstraints(round.constraints)
  const growsInUnboundedDimension = [...dimensionsOfCost(diff.graph)].some(
    (dimension) => !constraintDimensions.has(dimension)
  )

  if (growsInUnboundedDimension) {
    return {
      phase: "posingUnrescuableExplanation",
      graph: diff.graph,
      constraints: round.constraints,
      budget: round.budget,
      pinnedDiff: diff,
      pinnedCommitment: commitment,
      explanationPropositionId: diff.explanationPropositionId,
    }
  }

  // Def. 8.1, case 3 vs. case 4, derived (Rem. 8.0). Every dimension the
  // graph references is bounded by now, so evaluate cannot throw.
  if (isAdmissible(diff.graph, round.constraints, round.budget)) {
    return {
      phase: "admissibleAdvance",
      graph: diff.graph,
      constraints: round.constraints,
      budget: round.budget,
    }
  }

  // Validate the *whole* array first: a lazy check inside `.find` would let
  // an early rescuing candidate skip a later malformed one, and the
  // successor carries the whole array.
  for (const candidate of diff.rescueCandidates) {
    const reason = invalidRescueCandidateReason(round.constraints, candidate)
    if (reason !== undefined) {
      throw new Error(
        `nextRoundCycleState: a rescue candidate for "${diff.member.propositionId}" is not a valid Def. 3.2 constraint diff from C — ${reason}`
      )
    }
  }

  // Def. 8.2 case 1 vs. 2, derived from the candidates, never an authored flag.
  const rescuingCandidate = diff.rescueCandidates.find((candidate) =>
    isAdmissible(diff.graph, candidate.constraints, round.budget)
  )

  if (rescuingCandidate === undefined) {
    return {
      phase: "posingUnrescuableExplanation",
      graph: diff.graph,
      constraints: round.constraints,
      budget: round.budget,
      pinnedDiff: diff,
      pinnedCommitment: commitment,
      explanationPropositionId: diff.explanationPropositionId,
    }
  }

  return {
    phase: "posingRescueSelection",
    graph: diff.graph,
    constraints: round.constraints,
    budget: round.budget,
    pinnedDiff: diff,
    pinnedCommitment: commitment,
    rescueCandidates: diff.rescueCandidates,
  }
}

/**
 * Def. 8.2 case 2's precondition, checked at corpus level:
 * `explanationPropositionId` must resolve to an *active* register entry
 * (retired is not available, as in `roundProbeOf`). Rem. 7.2's amendment
 * protocol should guarantee this; a dangling or retired id leaves Def. 8.2's
 * second question with nothing to pose. An unrescuable diff itself is not a
 * defect (Rem. 8.2).
 *
 * `register` is keyed by `string`, not `PropositionId`, so tests can pass a
 * dangling id the way an author's typo would arrive. Run by
 * `round-assembly`'s `lintAuthoredRounds`.
 */
export function checkUnrescuableExplanationsResolve(
  options: ReadonlyArray<RoundDiffOption>,
  register: Readonly<
    Record<string, PropositionRegisterEntry>
  > = PROPOSITION_REGISTER
): Array<string> {
  const violations: Array<string> = []
  options.forEach((option, index) => {
    const entry = register[option.explanationPropositionId]
    if (entry === undefined) {
      violations.push(
        `diff option ${index}: explanationPropositionId "${option.explanationPropositionId}" is not in the proposition register (docs/canon/complexity-witness-canon.typ §7) — Def. 8.2's second question has no proposition to pose.`
      )
    } else if (entry.status !== "active") {
      violations.push(
        `diff option ${index}: explanationPropositionId "${option.explanationPropositionId}" (${entry.title}) is retired — Def. 8.2's second question needs a live proposition, the same restriction lib/leetype/round-probe's roundProbeOf already applies to a card's answer.`
      )
    }
  })
  return violations
}
