# Minimal-Code Refactoring Spec (Layer 1)

> Verbatim base, as first written. Amendments live in `SPEC-DRAFT.md`; this file
> is never edited.

> Context file for an agent. Read fully before acting. It defines the motivation, the theory, the evidence standard, and the procedure for a behavior-preserving reduction of code volume.

---

## 1. Purpose

Take a module or codebase `C` that is presumed naive and nudge it to `C′` such that:

1. **Non-lossy:** observable behavior is unchanged, so `⟦C′⟧ = ⟦C⟧`. No feature is dropped or altered.
2. **Shorter:** `|C′| < |C|`, where `|·|` is description length (lines of code as a proxy).
3. **Justified, not subjective:** the claim that `C` is naive is an _empirical_ claim backed by evidence, and the transformation is licensed by that evidence.

This is **not** a pursuit of perfect code, a style crusade, or code golf. It is a modest, evidence-gated nudge from a naive state toward a less naive one.

## 2. Scope: Layer 1 only

- **Layer 1 (this spec):** coarse, population-level evidence of naivety licenses coarse, well-understood moves. Expect substantial gains because the module is assumed naive enough.
- **Layer 2 (out of scope):** further gains need module-specific evidence and sharper prompting. Do not attempt it here. If you find opportunities beyond Layer 1, list them in the report and stop.

Work from a **1,000-foot view**: structure, shape, and measurements first. Do not start by reading code line by line. Reading code is for confirming a flagged region, not for discovering one.

## 3. Theoretical foundation

### 3.1 Code is a description of behavior

Let `F` be the feature set (the observable behavior). Many codebases realize `F`; together they form an equivalence class under observational equivalence. The naive module is one member. The nudge moves to another member with a shorter description.

### 3.2 Kolmogorov complexity as the compass

For any `C` with `⟦C⟧ = F`:

```
K(F) ≤ |C| + O(1)
```

Every valid codebase is an upper bound on the true minimum. The gap `|C| − K(F)` is **slack**, meaning regularity in `F` that the description fails to exploit. `K` is uncomputable, so it is a justification and a direction, never a metric to compute.

### 3.3 MDL as the stopping rule

Abstraction has a cost. Introducing one costs a one-time model length `a` and saves `s` per use across `n` uses. It is worthwhile only if:

```
n · s > a
```

This is the two-part Minimum Description Length criterion. **Stop abstracting when the next abstraction cannot repay its own cost.** Never introduce an abstraction with one or two uses unless it removes a restated fact.

### 3.4 Where regularity hides (what Layer 1 targets)

| Regularity                                                     | Mathematical idea                                                                             | Reduction                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| Repetition under a symmetry (n copies differing by parameters) | Quotient by the symmetry                                                                      | `n·c` → `c + n·p`              |
| Derivable facts (B computable from A)                          | Functional dependency / closure                                                               | State A, derive B              |
| Branches that are really a table                               | Interpreter plus data (invariance theorem: interpreter cost is a constant independent of `F`) | Data + one interpreter         |
| Independent axes of variation                                  | Product structure `X × Y`                                                                     | `N + M` instead of `N × M`     |
| Many traversals of one structure                               | Universal property of a fold                                                                  | One definition, many instances |

### 3.5 Honest caveats (do not overclaim)

These are corrections to an earlier, overreaching framing. Respect them:

- Duplication does **not** make entropy grow exponentially. Redundancy grows roughly linearly. The real cost is **synchronization and drift** between copies.
- "Declarative is O(1)" is a metaphor. The engine still does the work. You have relocated it, not eliminated it.
- Category theory is useful vocabulary for composition (small primitives, closed interfaces), not a derivation tool here.
- Minimal LOC is a **proxy**. The real target is minimal _concepts_ and _independent decisions_. If a shorter version is harder to decode, it is worse. Reject golfing.

## 4. Evidence standard: "naive" is an empirical claim

Naive means **membership in a known reference class**. Decades of work on code clones, code smells, and software evolution describe what bloated modules look like, and software is empirically far more repetitive than natural language. So slack is the norm in the population. The burden is to show this module's measurements resemble that shape.

### 4.1 Signal vector `s(C)`

Collect cheap, structural signals without deep reading:

- **Compression ratio:** compressed size over raw size. Low ratio means high redundancy. This is the practical stand-in for Kolmogorov complexity.
- **Clone ratio:** share of the module covered by structural duplicates.
- **Parallel structure:** many sibling units with the same shape.
- **Fact restatement:** the same schema, type, or rule appearing across layers or boundaries.
- **Co-change coupling:** files that always change together in version history, as evidence of non-orthogonality.
- **Branch-to-data ratio:** how much logic is really a lookup table.

### 4.2 Hypothesis test

- **H₀:** `C` is not naive. `s(C)` lies in the low-redundancy region of the reference population.
- **H₁:** `C` is naive. `s(C)` is worse than a chosen percentile (default: worse than median) on enough signals.

Use publicly known norms and tooling for the reference class. State which thresholds you used and why. Where no solid benchmark exists, say so and use a conservative threshold.

### 4.3 The license

The transformation `T` is permitted **only if H₁ is supported**. The expected gain is bounded by the slack, roughly `|C|` minus what a typical non-naive module of equivalent behavior would weigh. Do not promise more reduction than that bound supports.

### 4.4 The null clause (falsifiability)

If H₁ is **not** supported, the correct output is `T = identity`: a **zero-line diff**. This is a valid, successful result. It is what keeps the method falsifiable rather than a blanket license to refactor.

## 5. Procedure

1. **Survey (1,000 ft).** Map modules, boundaries, sibling units, and layers. No line-by-line reading.
2. **Measure.** Compute `s(C)` using available tooling (compression, clone detection, history analysis, structural counts). Record raw numbers.
3. **Test.** Compare against reference-class norms. Declare H₁ supported or not, per module. Different modules can get different verdicts.
4. **Gate.** Where H₁ is not supported, do nothing for that module (identity). Where supported, continue.
5. **Locate slack.** For each flagged region, name which regularity from §3.4 it exhibits.
6. **Apply MDL check.** Estimate `a` and `n·s` for each proposed abstraction. Drop any that do not pay.
7. **Transform.** Apply only the Layer 1 moves: dedupe under symmetry, derive instead of restate, tableize branches, factor independent axes, unify repeated traversals.
8. **Verify equivalence.** Prove `⟦C′⟧ = ⟦C⟧` using the existing tests, type checks, and build. If coverage is thin on the touched region, say so rather than assuming equivalence.
9. **Report** (see §6).

## 6. Required report

- Per-module signal values, thresholds used, and the H₀/H₁ verdict.
- For each change: which regularity it targets, estimated `a` versus `n·s`, and LOC before and after.
- Evidence of behavioral equivalence (tests run, results, known gaps).
- Modules left untouched (identity) and why.
- Remaining opportunities that belong to Layer 2, listed but **not** acted on.

## 7. Constraints and non-goals

- Do not change observable behavior, public interfaces, or semantics.
- Do not trade clarity for fewer lines. Reject changes that raise the number of concepts a reader must hold.
- Do not introduce abstractions with too few uses to repay their cost.
- Do not claim theoretical guarantees the theory does not give (see §3.5).
- Do not refactor modules whose evidence does not support H₁.
- Do not pursue perfection. A modest, justified reduction is the goal.
