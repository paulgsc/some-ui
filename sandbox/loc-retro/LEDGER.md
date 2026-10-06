# Ledger

One row per round. The checkpoint is the last `main` commit the round covered.
The next round starts at the first PR merged after it.

| Round | Date       | Checkpoint         | PRs (K) | Feature / trim / retire / bot | Spec | Report                  |
| ----- | ---------- | ------------------ | ------- | ----------------------------- | ---- | ----------------------- |
| 00    | 2026-10-06 | `f83a4119` (#1690) | 40      | 16 / 6 / 5 / 10 (+3 docs/ci)  | v0   | `rounds/00-baseline.md` |

## Baseline signals (feature PRs)

| Round | Test/src added | Comment share | Src T1 / T2 clone | Test T1 / T2 clone | Table / property tests |
| ----- | -------------- | ------------- | ----------------- | ------------------ | ---------------------- |
| 00    | 0.76           | 15.3%         | 1.5% / 3.7%       | 5.8% / 11.9%       | 14 / 0 of 754          |

## Scores (death-rate lift of flagged lines vs all added code lines)

| Flags from | Scored at  | Days later | Added dead | Comment lift | Type-2 clone lift |
| ---------- | ---------- | ---------- | ---------- | ------------ | ----------------- |
| 00         | `f83a4119` | 0          | 8.4%       | 1.42×        | 1.82×             |
