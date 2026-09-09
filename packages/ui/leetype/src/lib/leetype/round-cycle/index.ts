/**
 * The cycle's failure branch (LTY-PROBE, B4, #1221) — `docs/canon/complexity-witness-canon.typ`
 * Def. 8.1, Def. 8.2, Thm. 8.1, Rem. 8.0, Rem. 8.1, Rem. 8.2, Prop. 8.1.
 *
 * A pure reducer over one round's own transition (Def. 8.1) and its failure
 * successor (Def. 8.2) — no DOM, no wasm engine, no execution result. Rem.
 * 8.0 records this canon's own prior mistake in exactly this spot: an
 * earlier draft branched the cycle on `r` ("r = ok, therefore A is
 * admissible"), precisely the inference Corollary 4.1 forbids. The branch
 * here is always the *derived* relation `isAdmissible` (`lib/leetype/
 * admissibility`, G3, #1211) computes from a cost graph, never a run
 * result — `RunResult` does not appear anywhere in this module, by
 * construction rather than convention.
 *
 * Engine-free, in the register of `lib/leetype/admissibility`,
 * `lib/leetype/cost`, and `lib/leetype/rewrite`: nothing here imports the
 * wasm loader or any hook, and nothing live imports this yet (Step 6, C1,
 * #1213, is where a real UI eventually would).
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
 * A candidate rescuing constraint set `C″` (Def. 8.2, case 1) — "some
 * constraint set, over the same dimensions, with `T_{A+d}(C″) <= B`."
 * `propositionId` is the register entry a learner would need to name to
 * explain *why* this particular `C″` puts `A+d` back inside budget —
 * authored, the same posture every other μ-shaped id in this workspace
 * takes (Ax. 6.1). Whether `constraints` itself actually rescues is never
 * authored here, only checked — see `nextRoundCycleState`, below.
 *
 * "Over the same dimensions" (Def. 3.2/8.2) is a real precondition, not
 * decoration: `constraints` must be a valid Def. 3.2 constraint diff away
 * from `C` — same dimensions, same comparison operators, at least one
 * bound actually differing. `nextRoundCycleState` validates every
 * candidate against `ConstraintDiffSchema` (`types/constraint.ts`) before
 * ever evaluating one, rather than letting a mismatched candidate reach
 * `isAdmissible`'s own `evaluate` (which throws for a graph referencing an
 * unbounded dimension) or produce a successor state no presentation model
 * could actually render (review findings on this PR, chatgpt-codex-connector).
 */
export type RescueCandidate = {
  readonly constraints: ConstraintSet
  readonly propositionId: PropositionId
}

/**
 * One member of `D`, together with the two things Def. 8.2 needs ready the
 * instant this diff is the one a learner selects and turns out not to
 * restore admissibility. Neither is computed from `member` or derived from
 * `d` itself; both are authored corpus data, the same posture `member`'s
 * own `propositionId`/`distractorStatement` already take:
 *
 * - `graph` is `G_{A+d}` (Thm. 5.1's own "after" half, `lib/leetype/
 *   rewrite`'s `rewriteOf`) — what `isAdmissible` actually evaluates.
 *   Never `member.admissible`, which is an independent authored claim
 *   about a different question (Prop. 2.1's own agreement check, G3) this
 *   reducer does not re-run — see `nextRoundCycleState`'s own doc comment.
 * - `rescueCandidates` are Def. 8.2 case 1's own candidate `C″`s: the
 *   *only* mechanism `nextRoundCycleState` uses to decide whether a rescue
 *   exists (see that function's own doc comment for why a graph-only
 *   derivation was tried and abandoned — this cost algebra allows a term
 *   to go negative, which breaks any bound-independent lower- or upper-
 *   bound argument over the graph's own algebra). Possibly empty, a
 *   legitimate corpus choice for a diff whose cost is independent of every
 *   bounded dimension by design (`CW-P16`'s own shape) — but also the one
 *   place this module cannot itself catch an author who *should* have
 *   authored a working candidate and didn't; see that same doc comment.
 * - `explanationPropositionId` is Def. 8.2 case 2's own fallback: the
 *   register entry a learner would need to name when no candidate
 *   rescues. Always present — Thm. 8.1's own proof is explicit that
 *   totality here is a claim about the transition function, not about
 *   corpus coverage, and Rem. 7.2's amendment protocol is what is supposed
 *   to keep a real register entry behind this id *before* a round like
 *   this one is authored. `checkUnrescuableExplanationsResolve` (below) is
 *   the lint that catches an author who skipped that step.
 */
export type RoundDiffOption = {
  readonly member: DiffSetMember
  readonly graph: CostGraph
  readonly rescueCandidates: ReadonlyArray<RescueCandidate>
  readonly explanationPropositionId: PropositionId
}

/**
 * Def. 8.1 case 2: `T_A(C) > B`. `D` is presented and the learner's task is
 * to select a pair `(d, p)` — `d` ranges over this state's own
 * `diffOptions`; `p` is deliberately not modeled anywhere in this phase or
 * in `RoundCycleResponse`'s branch-relevant fields, because Def. 8.1's own
 * branch never reads it (see `nextRoundCycleState`'s doc comment).
 */
export type RoundCyclePosingDiffSelection = {
  readonly phase: "posingDiffSelection"
  readonly graph: CostGraph
  readonly constraints: ConstraintSet
  readonly budget: Budget
  readonly diffOptions: ReadonlyArray<RoundDiffOption>
}

/**
 * The successor of Def. 8.1 cases 1 and 3 alike: `A` (held fixed — possibly
 * `A+d`, from case 3) is admissible under `C`, and the next round's own job
 * is to diff the constraint (`C -> C'`) and pose Prop. 4.2's anticipation
 * task. Which `C'` to author, and which corpus round comes next, is #1230
 * L4's own job (reading the ledger) — explicitly out of this story's own
 * scope — so this phase carries nothing more than what case 1/3 fix: the
 * admissible graph, its constraints, and the budget.
 */
export type RoundCycleAdmissibleAdvance = {
  readonly phase: "admissibleAdvance"
  readonly graph: CostGraph
  readonly constraints: ConstraintSet
  readonly budget: Budget
}

/**
 * Def. 8.2, case 1: a rescuing `C″` exists. `(d, p)` is held fixed
 * (`pinnedDiff`, `pinnedCommitment`); the next question is `(c, p)` —
 * which constraint diff, and the proposition explaining why it works.
 * `pinnedCommitment` is the learner's own prior guess (review finding on
 * this PR, chatgpt-codex-connector: an earlier draft destructured only
 * `diff` out of the response and dropped it, so an abstention and a
 * specific — even correct — guess produced indistinguishable successor
 * states) — carried through so a future surface can show what the
 * question is based on, never read by this module to pick the branch.
 * `rescueCandidates` is carried through unfiltered (distractor `C″`s
 * included — the same "not every option is the right one" shape `D`
 * itself already has); a future surface (Step 6, C1) owns presentation.
 * Deriving *whether* one rescues is this module's own job, already done
 * once to reach this phase.
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
 * Def. 8.2, case 2: no rescuing `C″` exists. `(d, p)` is held fixed
 * (`pinnedDiff`, `pinnedCommitment` — see the identical note on
 * `RoundCyclePosingRescueSelection`, above); the next question is
 * `(d, p')` — the same diff again, but now the learner is asked to name
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
 * Def. 1.7's round tuple, cut down to exactly what Def. 8.1/8.2 branch on —
 * no `r` (Rem. 8.0), and no win state, completion fraction, or exhausted-
 * corpus condition (Prop. 8.1). This union has no member spelling any of
 * those out, which is what makes Prop. 8.1 a fact about the type rather
 * than a rule a caller has to remember to uphold. Four variants, one per
 * named successor in Thm. 8.1's own proof ("the state advances on every
 * branch, from a `(d,p)` selection to a `(c,p)` or `(d,p')` selection").
 */
export type RoundCycleState =
  | RoundCyclePosingDiffSelection
  | RoundCycleAdmissibleAdvance
  | RoundCyclePosingRescueSelection
  | RoundCyclePosingUnrescuableExplanation

/**
 * Def. 8.1's own entry point: is `A` admissible under `C` at all? Not a
 * response to any learner action — a fresh round is classified this way
 * the instant its `(A, C, B)` and candidate `D` are known, before anyone
 * has selected anything. Kept separate from `nextRoundCycleState` (the
 * actual reducer, below) because it takes no prior `RoundCycleState` —
 * there is nothing yet to reduce.
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
 * The one action `nextRoundCycleState` reduces over: the learner's selected
 * `d`, paired with their proposition guess `p` (`commitment`, Def. 9.1's own
 * closed set — `CommitmentControl`/`RoundChoices`, C3/#1215). `commitment`
 * is part of this type only because Def. 8.1 literally calls the learner's
 * selection a pair `(d, p)` — `nextRoundCycleState` never reads it (see
 * that function's own doc comment for why reading it would repeat Rem.
 * 8.0's mistake one level up).
 */
export type RoundCycleResponse = {
  readonly kind: "selectDiff"
  readonly diff: RoundDiffOption
  readonly commitment: Commitment
}

/**
 * Every dimension a graph's own *computed* cost actually references —
 * `costOf(graph)`'s surviving terms, never `graph`'s raw structure. Deriving
 * this from `costOf` rather than walking `Loop`/`Seq`/`W` nodes directly
 * matters exactly when a term's coefficient normalizes to zero (review
 * finding on this PR, chatgpt-codex-connector): `Loop(dim("m"), W(0))`
 * structurally repeats over `m`, but contributes nothing to `T(G)` at all
 * (`costOf`'s own doc comment: "zero-coefficient terms dropped"), so no
 * assignment of `m`'s bound — including none at all — can change the
 * evaluated cost. `nextRoundCycleState`'s own `growsInUnboundedDimension`
 * check would otherwise flag `m` as unbounded and misroute an admissible
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
 * A rescue candidate `C″` is only ever meaningful as the constraint diff
 * `C -> C″` Def. 8.2 case 1 says the next round presents — so it is held to
 * `ConstraintDiffSchema`'s own validity rules (`types/constraint.ts`)
 * directly, rather than a hand-rolled, narrower re-check: same dimensions,
 * same comparison operators, and at least one bound actually differing
 * (review finding on this PR, chatgpt-codex-connector: an earlier draft
 * checked only that dimension *names* matched, so a candidate that flipped
 * `n <= 1000` to `n >= 400` passed even though `isAdmissible` evaluates
 * only the numeric bound and `ConstraintDiffSchema` itself rejects an
 * operator change — an accepted candidate `nextRoundCycleState`'s own
 * successor could never actually present).
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
 * Def. 8.1 cases 3/4, and Def. 8.2's own two cases when case 4 fires — the
 * pure reducer `(round, response) -> round` #1221's own acceptance criteria
 * ask for. `round` must already be `posingDiffSelection` (`D` is
 * presented) — every other phase is itself already a successor, per this
 * module's own doc comments, with no further response modeled for it
 * within this story's scope (persisting the cycle past this point, or
 * reading which corpus round comes next, is #1230 L4's own job).
 *
 * `response.commitment` (the learner's `p` half of the pair) is read only
 * to carry it, unread, into a Def. 8.2 successor's own `pinnedCommitment`
 * (Def. 8.2: "`(d, p)` is held fixed") — never to pick a branch. Neither is
 * `response.diff.member.admissible` (the diff's own *authored* claim) ever
 * read for branching. Both are deliberate: Def. 8.1's branch is stated
 * purely in terms of the derived relation `T_{A+d}(C) <= B`, a fact about
 * which diff was picked, never about whether the learner's guess was
 * correct or about what the diff's author claimed. Conflating either with
 * the derived branch is exactly Rem. 8.0's own recorded mistake, restated
 * one level up from "branching on `r`." Scoring the guess is
 * `RoundFeedback`'s job (B3, already landed); this function's only job is
 * which *question* comes next.
 *
 * `response.diff` must be one of `round.diffOptions`' own objects — Def.
 * 8.1 case 2 defines this transition over a selection *from the presented
 * D*, never from a diff the round never offered (review finding on this
 * PR, chatgpt-codex-connector: an earlier draft trusted any structurally
 * valid `RoundDiffOption`, so a stale callback or a miswired caller could
 * advance the cycle on a graph and rescue data the learner was never shown).
 * Checked by reference identity, not deep equality: a real caller is
 * expected to hold `round.diffOptions` itself and pass back the literal
 * element the learner picked (the same discipline `RoundChoices`, C3/
 * #1215, already expects of its own `onCommit` caller), not reconstruct an
 * equivalent-looking object.
 *
 * A diff whose own `graph` repeats over a dimension `C` does not bound is
 * routed straight to Def. 8.2 case 2 (review finding on this PR,
 * chatgpt-codex-connector) — `lib/leetype/constraint`'s own
 * `checkConstraintDimensions` already documents this as a legitimate
 * modelling choice, not malformed data, and Def. 8.2's own second disjunct
 * names it directly ("grows in a dimension C does not bound"): `T_{A+d}(C)`
 * is undefined here (Def. 3.1), so it can never be case 3, and no Def. 3.2
 * constraint diff could ever bound a dimension outside `C`'s own set either
 * (the identical "same dimensions" requirement every rescue candidate is
 * already held to), so no rescue is possible even in principle.
 *
 * "References" here means `costOf(diff.graph)`'s own surviving terms, never
 * `diff.graph`'s raw structure (review finding on this PR, chatgpt-codex-
 * connector): a zero-coefficient term normalizes away entirely (`costOf`'s
 * own doc comment), so e.g. `Loop(dim("m"), W(0))` contributes nothing to
 * `T(G)` and `isAdmissible` never needs `m` bounded at all — walking the
 * graph structurally would flag `m` as unbounded and misroute a diff
 * `isAdmissible` would have happily evaluated to case 2 regardless.
 *
 * Def. 8.2's own case split, once `growsInUnboundedDimension` is ruled out,
 * is decided by testing every authored `rescueCandidate` against
 * `isAdmissible` — never by deriving "does any assignment of the bounds
 * satisfy the relation" from `diff.graph`'s own algebraic structure alone.
 * An earlier draft on this PR tried exactly that (an "independent of every
 * bounded dimension" lower bound, refined further to exempt graphs with a
 * `log` factor) and two independent review findings each produced a real
 * cost graph that broke it: `Seq(Loop(dim("n", 2), W(1)), Loop(logDim("n",
 * 2), W(1)))` (`n² + (log₂ n)²`) has no term independent of every bounded
 * dimension yet its own true minimum sits near 1, refuting the "no such
 * term, so a rescue is always possible" half; `Seq(W(2), Loop(logDim("n"),
 * W(2)))` is rescued by a bound *below* 1 (`log₂` of a fraction is
 * negative, and multiplying by a positive coefficient keeps it negative,
 * so the term *subtracts* from the graph's own "independent" cost) at a
 * bound where a `log` factor is present, refuting the "exceeds the
 * independent cost, so definitely unrescuable" other half. This cost
 * algebra has no floor forbidding a bound below 1 or a term from going
 * negative, so no bound-independent argument over its own algebra can be
 * trusted in general — `isAdmissible`, run against real authored data, is
 * the only relation this module treats as ground truth (Prop. 2.1's own
 * rule, restated one level further in). Whether the corpus has authored a
 * rescuing candidate for every diff that has one is therefore a real,
 * disclosed limitation of this design, the same shape as `lib/leetype/
 * round-probe`'s own disclosed gap on Prop. 6.1 — not something this
 * function derives further.
 *
 * The return type excludes `RoundCyclePosingDiffSelection` — a type-level
 * form of Thm. 8.1's "no learner response returns the cycle to a state
 * already visited": this function cannot produce the state it started
 * from, checked by the compiler rather than left as a convention.
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

  // Def. 8.1, case 3 vs. case 4: T_{A+d}(C) <= B, derived — never read off
  // diff.member.admissible (Rem. 8.0's own lesson, restated for selection
  // instead of execution). Safe now: every dimension diff.graph references
  // is confirmed bounded by round.constraints, so evaluate cannot throw.
  if (isAdmissible(diff.graph, round.constraints, round.budget)) {
    return {
      phase: "admissibleAdvance",
      graph: diff.graph,
      constraints: round.constraints,
      budget: round.budget,
    }
  }

  // Def. 8.2: every candidate is validated against ConstraintDiffSchema
  // first, in a dedicated pass over the *whole* array — review finding on
  // this PR, chatgpt-codex-connector: checking each candidate lazily
  // inside `.find` let a valid rescuing candidate short-circuit the search
  // before a later, malformed candidate in the same array was ever
  // validated, even though that whole (unfiltered) array is what the
  // successor state goes on to carry.
  for (const candidate of diff.rescueCandidates) {
    const reason = invalidRescueCandidateReason(round.constraints, candidate)
    if (reason !== undefined) {
      throw new Error(
        `nextRoundCycleState: a rescue candidate for "${diff.member.propositionId}" is not a valid Def. 3.2 constraint diff from C — ${reason}`
      )
    }
  }

  // Which of Def. 8.2's two cases applies is derived by testing every
  // authored candidate against isAdmissible (see this function's own doc
  // comment for why a graph-only derivation is not attempted) — never from
  // an authored "this diff is rescuable" flag.
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
 * Def. 8.2 case 2's own precondition, made checkable at the corpus level
 * rather than left implicit: `explanationPropositionId` must resolve to an
 * *active* register entry — retired is not "available" any more than
 * `roundProbeOf` (`lib/leetype/round-probe`) treats a retired id as a live
 * card's answer, for the identical reason. Rem. 7.2's amendment protocol is
 * supposed to guarantee this before a round needing it is authored; a diff
 * option whose `explanationPropositionId` does not resolve, or resolves to
 * a retired entry, has no real proposition available to pose Def. 8.2's
 * second question with — exactly the lint failure #1221's own acceptance
 * criteria name, distinct from (and never triggered by) an unrescuable diff
 * itself, which Rem. 8.2 says is not a defect.
 *
 * `register` is typed loosely (`Record<string, ...>`, not keyed by the
 * strict `PropositionId` union) so a caller can exercise a dangling id the
 * same way `checkCitations`'s own tests do — an author's typo is a plain
 * string, not a value the type system can rule out ahead of a check like
 * this one.
 *
 * Not yet wired into `lib/leetype/exercises/corpus-lint`'s `lintRoundCorpus`
 * — the same "additive, proven by fixture, not yet load-bearing against
 * real data" posture G3's own `checkAdmissibleClaimsAgreeWithDerivation`
 * took, since no live corpus builds a `RoundDiffOption` yet (Step 6, C1,
 * #1213, has not landed).
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
