# Round 00 — baseline over the last 40 merged PRs

- **Date:** 2026-10-06
- **Window:** #1566 … #1690 (2026-09-29 → 2026-10-05), 40 PRs on `main`'s
  first-parent history, checkpoint `f83a4119` (#1690)
- **Spec version in force:** base only. This round produced `SPEC-DRAFT.md` v0.
- **Raw data:** `rounds/00/` (`summary.txt` has every number quoted here)

## PR classification (by hand, from titles and bodies)

| Class     | PRs                                                                             | n   |
| --------- | ------------------------------------------------------------------------------- | --- |
| feature   | 1684 1673 1672 1671 1663 1662 1665 1659 1648 1641 1639 1636 1638 1631 1630 1613 | 16  |
| trim      | 1685 1689 1690 1643 1635 1634                                                   | 6   |
| retire    | 1660 1645 1644 1640 1632                                                        | 5   |
| docs / ci | 1674 1668 1642                                                                  | 3   |
| bot       | 1611 1612 1614 1664 1605 1607 1608 1609 1610 1566                               | 10  |

All 30 non-bot PRs carry a Claude session trailer, so every human-merged PR in
the window was agent-written. Trailers start at #193 (2026-06-20), so older
origins in the death analysis show as not agent-written even when some were.

## Findings

### 1. Most cut lines were retirements or trims of older code, not fresh slack

The trims and retirements deleted 121k lines. Traced by blame to the PR that
added them:

| Age of deleted source lines | Trim (77k lines total) | Retire (44k lines total) |
| --------------------------- | ---------------------- | ------------------------ |
| < 7 days                    | 4.9%                   | 0.1%                     |
| 7–30 days                   | 11.4%                  | 0.0%                     |
| 30–90 days                  | 26.4%                  | 12.3%                    |
| > 90 days                   | 57.3%                  | 87.5%                    |

(`summary.txt` has the other categories.) Retirements are product
decisions on code with a median age of 278 days. No generation-time rule
buys anything there. **→ A2.**

### 2. What trims cut: comments, tests, stories, unused code

| Trimmed from live code   | Lines  | Share |
| ------------------------ | ------ | ----- |
| source code              | 19,189 | 24.9% |
| source comments          | 18,098 | 23.5% |
| test code                | 12,108 | 15.7% |
| stories                  | 10,569 | 13.7% |
| test comments            | 6,113  | 7.9%  |
| other (blank, config, …) | ~11k   | ~14%  |

Of the 19k source code lines, 14.6k come from #1685. That PR mixes code that
knip found unused with three retired workspaces, and this round does not
separate the two, so the trim class is overstated by some of it. Stories were
mostly #1690 (9k), which applied #1687's rule. Unused code (knip) and stories
are now enforced, which leaves **comments and test shape** as the classes with
no rule yet. **→ A5, A6, A7.**

### 3. Tests die youngest and are the most repetitive

- Trimmed tests: median age **51 days** (p25: 22) vs 107 for source; **77%**
  agent-written vs 43% for source.
- Type-2 (literal-normalized) clones: tests **19.0%** vs source **12.0%** at
  head. In feature PRs: tests **11.9%** vs source **3.7%**.
- Shape of the 754 test cases added by feature PRs: **14** table-driven,
  **0** properties, 166 mocks. Repo-wide: 2.8% table-driven, 1.7% property.
- Feature PRs add 0.76 test lines per source line.

This supports the claim that tests are where generation-time slack gathers. The
stronger claim, that invariants could replace most tests, is not tested yet.
**→ A6** proposes mutation score as the equivalence and a round-01 experiment.

### 4. Exact duplication is low; the null clause fires for it

Exact 6-line clones: 4.0% of source at head, 1.5% of source added by feature
PRs. A sweep for exact copies would have flagged 192 significant source lines
across 16 feature PRs. That is not the slack. **→ A4.**

### 5. First scoring signal (weak: scored inside its own one-week window)

| Flag class (feature + all non-bot PRs) | Lines  | Dead at `f83a4119` | Lift  |
| -------------------------------------- | ------ | ------------------ | ----- |
| all added code lines                   | 52,629 | 8.4%               | 1.00× |
| comment lines                          | 14,734 | 11.9%              | 1.42× |
| Type-2 clone lines                     | 2,753  | 15.3%              | 1.82× |

Rescoring these same flags at each later round is the first real test of A4
and A5.

## Per-workspace recon (Type-2, for the recon loop; no action taken)

Highest test Type-2: `packages/eslint` 47.9%, `some-mujik` 44.8%,
`contract-harness` 39.7%, `some-filter` 32.9%, `wireframes` 32.0%,
`extensions/common` 27.2%, `lesson-crm` 24.7%. Highest source Type-2:
`contract-harness` 27.0%, `leetype` 22.3%, `activity-catalog` 19.8%, `topik`
17.6%. These are likely data tables and need a look first (A4). Compression
ratios fall in 0.20–0.43 with no outliers and no norm to compare against, so
they gave no verdict this round.

## Caveats

- One week of history. Lifts are scored against a head only days later.
- Blame runs without `-C`, so moves across files count as deaths (#1689 moved
  much of `some-ui-utils`).
- Comments are found by line prefix. JSX `{/* */}` and trailing comments are
  missed.
- `--trim` / `--feature` is a hand classification, made per PR. #1685 is
  classed trim, but it also retired three workspaces.

## Next round

1. Rescore `rounds/00/flags.json` at the new head. Record lift for comments
   and Type-2 clones.
2. Run the same measurements over PRs merged after `f83a4119`. Add them to the
   ledger, and set A1's 75th percentile once there are 25 or more feature PRs.
3. A5: hand-label about 100 added comment lines from round-00 feature PRs.
4. A6: Stryker baseline on one high-test-Type-2 module, plus a sandbox-only
   quotient prototype. Report lines and mutation score before and after.
