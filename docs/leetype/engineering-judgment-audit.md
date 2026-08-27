# LeetType seed audit: correctness versus fitness

This audit applies the positive invariant in
`packages/some-content/prompts/leetype-exercise-generator/index.md`: a useful
probe must discriminate between correct candidates from operative constraints
and identify a counterfactual boundary. Compiling code, correct output, and a
named technique are evidence, not the competency.

## Result

The pre-existing instructional seed set does **not** meet that invariant. It
was authored under the older falsification/repair and obligation/witness rules.
Those rules excluded some syntax pedagogy, but they did not require two correct
candidates, constraint-conditioned selection, or a changed-constraint test.
The old exercises remain in the corpus only for compatibility, stories, and
tests; `SESSION_EXERCISE_IDS` does not serve them to either production surface.

`fixtures.ts` is excluded: its adversarial exercise is renderer stress data,
not an instructional claim.

## Inventory

| Seed                      | Present epistemic demand                          | Finding under the new invariant                                                                                                                                           |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entry-api.ts` steps 1–2  | import and mutable-map construction               | Levels 0–1: direct Rust syntax/API recall. Explicitly disallowed.                                                                                                         |
| `entry-api.ts` steps 3–8  | reproduce an accumulating Entry API expression    | Mostly levels 1–3. The code witnesses local behavior, but no two correct designs or counterfactual boundary are learner-facing.                                           |
| `entry-api.ts` steps 9–10 | repair double lookup and eager construction       | Mechanistic local repair. Costs are named, but the learner is not asked when the rejected correct design becomes fit.                                                     |
| `loop-progress.ts`        | add cursor progress to a nonterminating loop      | Behavioral correctness. There is no correct competing policy.                                                                                                             |
| `inclusive-boundary.ts`   | repair an off-by-one bound                        | Behavioral correctness. Expected output uniquely exposes the defect.                                                                                                      |
| `shrinking-interval.ts`   | repair interval convergence                       | Mechanistic correctness. The invariant is useful but not a design-space decision.                                                                                         |
| `division-guard.ts`       | add a precondition guard                          | Behavioral correctness/failure prevention, without boundary-policy alternatives.                                                                                          |
| `memoization.ts`          | add a memo lookup to exponential Fibonacci        | Levels 2–3 and vulnerable to `overlap → memoization` pattern matching. It does not derive purity/key identity or contrast memory, recomputation, and changed constraints. |
| `lazy-default.ts`         | replace eager construction with lazy construction | Closest to level 4: both forms are correct and an operational cost differs. It still lacks a counterfactual in which eager evaluation is preferable.                      |
| `binary-search-place.ts`  | reuse `Err(i)` as an insertion position           | Mechanistic optimization and vulnerable to `sorted → binary search`. It does not ask when a scan is justified by mutation, data size, or another downstream observation.  |

## Concept registry finding

Concept identifiers are vocabulary, not exercises, so an identifier cannot by
itself pass or fail the invariant. The risk is **how it is probed**. API-shaped
or canonical-technique identifiers make shallow generation especially easy:

- `use-declarations`, `mutability`, `type-inference`, `borrowing`,
  `mutable-references`, `method-chaining`, `expression-oriented-style`,
  `generics`, and `trait-bounds` currently describe language-production rungs;
- `memoization`, `lookup-as-place`, `window-shrinking`, and
  `exclusive-vs-inclusive-bounds` can support judgment, but their existing
  instances establish local mechanism or repair rather than fitness;
- `eager-vs-lazy-evaluation`, `single-lookup-mutation`, `amortized-hashing`,
  and `double-lookup` already name decision-relevant properties, but their
  exercises still need explicit alternatives and decision boundaries.

Do not delete a concept merely because its current probe is shallow. Reauthor
the probe so the justification bottoms out in required information, costs,
failure modes, and boundaries rather than the concept's name.

## Disposition

1. Keep legacy seeds addressable so existing deep links and fixture tests do
   not break.
2. Keep them out of `SESSION_EXERCISE_IDS`; they are not learner-facing under
   the stronger contract.
3. Do not use a legacy seed as a positive generator example until it has two
   correct candidates and a realistic counterfactual boundary.
4. Review new curricula rung by rung. A long ladder is not automatically deep:
   each rung must make its decision reason and validity boundary auditable.
