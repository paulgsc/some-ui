# Spec draft — amendments to `SPEC-BASE.md`

Version **v0** (round 00). Each amendment has an ID (stable, never renumbered),
a status, and the evidence that put it here. Statuses:

- **adopted** — the evidence so far supports it; it shapes how rounds are run.
- **hypothesis** — proposed, with a test a later round can pass or fail.
- **open** — a question the evidence has not reached yet.
- **retired** — falsified or superseded; kept with the reason.

The spec this converges to has three uses: a pre-merge sweep on every PR, a
delayed retrospective over merged PRs, and recon of code already on `main`.
The base spec is written for the third. A1–A3 adapt it to the first two.

---

## A1. A PR is judged on the slack it adds, against this repo's own baseline — adopted

- _Change to base:_ §4.2 compares a module to "publicly known norms". For a
  diff the question is different: did this diff add slack it did not need? The
  reference class is this repo's own merged PRs (the ledger), not the
  literature.
- _Why:_ no public benchmark fits. Clone studies report 7–23% cloned code
  (Roy & Cordy 2007), but with near-miss detectors whose numbers are not
  comparable to ours. Compression ratio has no accepted norm for TypeScript at
  all. The repo's own distribution is measured and stable: feature PRs in round
  00 add source with 1.5% exact / 3.7% literal-normalized clones and tests with
  5.8% / 11.9%.
- _Threshold for now:_ a PR is worse than the repo when a signal is above the
  75th percentile of feature PRs in the ledger. Too few PRs yet to state that
  percentile; round 01 sets it.

## A2. No gate on raw line count — adopted

- _Change to base:_ the sweep argues about slack (the §3.4 regularities, A5,
  A6), never about how many lines a PR adds.
- _Why:_ of 121k lines cut in the 40-PR window, 44k (37%) were retirements:
  whole features removed by a product decision, median age 278 days. No rule
  applied when that code was written could have prevented it, so a line budget
  would only have taxed the features that later shipped. And feature PRs show
  little exact duplication (1.5%) to cut.

## A3. Numbers from a script, judgment in `REVIEW.md`, steward triggers it — hypothesis

- _Proposal:_ measurement as a script (like `check:workflows`), the judgment as
  a `REVIEW.md` section any reviewer applies, and one steward line to run it on
  each head. babysit only sets polling cadence and steward only covers PRs Claude
  drives, so neither can be the home on its own.
- _Test:_ not testable by backtest. Decide when landing.

## A4. Exact clones are not where this repo's slack is — adopted (null clause)

- _Evidence:_ exact 6-line clones are 4.0% of source at head and 1.5% of
  source added by feature PRs. §4.4 applies: on exact duplication H₁ is not
  supported for most workspaces, and a sweep built on it would find little.
  Literal-normalized clones (same code, different strings and numbers) are 3×
  higher (12.0% of source at head). Round 00's early score: Type-2 flagged
  lines die at 15.3% vs 8.4% for all added code lines (lift 1.82×).
- _Consequence:_ detect Type-2, not Type-1. Watch the lift in later rounds.
  Expected false positives: data tables (rounds, fixtures, lesson content) look
  like literal clones by construction. `leetype` (22% source Type-2) and
  `contract-harness` (27%) need a look before they count as slack.

## A5. Comments are a slack class the base spec does not name — hypothesis

- _Evidence:_ comment lines are 24.2k of the 77k lines trimmed from live code
  (31%). In #1685 they were "history/provenance narrative, restated code". Feature
  PRs in the window still add comments as 15.3% of all code lines (5,980), and
  those die 1.42× faster than code in general.
- _Proposed regularities:_ a comment that restates the code is a **derivable
  fact** (§3.4 row 2). A comment that tells how the code came to be is a fact
  **stored in the wrong place**: it belongs in the commit or PR body, where
  `git blame` finds it.
- _Open:_ a regex finds provenance markers in only 1% of added comments, so the
  classification needs a reader. Round 01 should hand-label a sample of about
  100 added comment lines (keep: non-obvious why, invariant tags such as
  `Lifetime:` or `Cost (LP3):`; slack: restated or historical) and score the
  labels against later deaths.

## A6. Tests: non-lossy means "catches the same faults" — hypothesis

The base spec has a gap here. Tests are not observable behavior, so deleting a
test trivially keeps `⟦C′⟧ = ⟦C⟧`, and §5.8 needs the tests themselves to show
equivalence. So the base spec can neither license nor forbid shrinking them.

- _Evidence that tests carry slack:_
  - Tests are 39% of code (113k test lines vs 179k source). Feature PRs add 0.76
    test lines per source line.
  - They are more repetitive than source: 19.0% vs 12.0% Type-2 clones at
    head, and 11.9% vs 3.7% in feature PRs.
  - They die young. Trimmed test lines had a median age of 51 days (p25: 22)
    vs 107 for source, and 77% of them were agent-written.
  - #1685 cut thousands of test lines with "no case dropped, test counts
    unchanged", by turning per-test literals into builders and `it.each`
    tables. That is §3.4 row 1, a quotient by symmetry.
  - The shape is almost entirely pointwise. Of 754 test cases added in the
    window, 14 are table-driven and 0 are properties. `fast-check` is a
    dependency, and `speech` (38), `wireframes` (22) and `suspender-ledger` (10)
    show it works here.
- _Proposed semantics:_ the meaning of a test suite is the set of faults it
  detects, `⟦T⟧ ≈ mutants killed`. Shrinking a suite is non-lossy when the
  mutation score on the touched module does not drop. Tools: Stryker for
  TypeScript, `cargo-mutants` for Rust. This gives tests the same falsifiable
  equivalence the base spec gives code.
- _Layer 1 move for tests:_ quotient pointwise cases under their symmetry
  (builders, `it.each`), with case count and mutation score unchanged.
- _Layer 2 move:_ replace a family of examples with a property over a pure
  `step` or state machine (the shape `CLAUDE.md` → "React is not the
  coordinator" already asks for). The family's titles name the property.
- _Limits (where "no test needed" overclaims):_ TypeScript types prove little,
  so a model still needs at least one property test tying the code to it. A
  regression test that pins a bug's exact input is information a random
  generator may not find again; keep it as a seeded example
  (`fc.assert(..., { examples })`) rather than delete it.
- _Test of the hypothesis:_ round 01 runs Stryker on one module with high
  test Type-2 (`extensions/common` 27%, `packages/eslint` 48%, or
  `some-filter` 33%), prototypes the Layer 1 quotient in the sandbox (not
  landed), and reports lines before and after at equal mutation score.

## A7. What a rule already enforces is out of the sweep — adopted

- _Evidence:_ every big trim in the window was followed by a rule. Stories
  (12k trimmed) led to #1687's rule, and feature PRs then added 174 story lines.
  Dead code led to knip in CI (#1643). Duplicates led to `REVIEW.md` (#1642).
  Slack classes are found by a trim, then closed by a rule.
- _Consequence:_ the sweep's job is to find the next rule, not repeat the
  existing ones. Comments (A5) and test shape (A6) are the classes with no rule
  yet.

## A8. Retrospective scoring is death-rate lift — adopted, with caveats

- _Method:_ record the lines each rule would have flagged per PR
  (`flags.json`). At each later round, compare how many flagged lines are dead
  to how many added code lines are dead in the same PRs. A rule earns its place
  when its lift stays above 1 as rounds accumulate, and when it flags a share of
  later trims (recall) large enough to matter.
- _Caveats:_
  - Circularity: a trim may cut exactly what a person or agent was already
    looking for, so lift can measure taste as well as slack.
  - Blame without `-C` counts a move across files as a death.
  - Round 00 scored its own window (one week), so its lifts are weak evidence.
