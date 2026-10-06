# LOC retrospective sandbox — DO NOT MERGE

> **This directory must never reach `main`.** It lives only on the branch
> `ccr-db7d0a2d-vls0mg`, which has no pull request on purpose. If that branch is
> ever opened as a PR, delete `sandbox/loc-retro/` from it first. Nothing here is
> wired into CI, lint, turbo or the workspace; it is a lab notebook.

## What this is

An experiment to find out, from this repo's own history, what a "reduce lines of
code at generation" practice would actually buy before any of it is landed. Each
round replays the current draft rules against PRs that merged on `main` since the
last round, records what they would have flagged, and checks those flags against
what later PRs really cut. The spec is shaped from that evidence over several
rounds.

- `SPEC-BASE.md` — the original Layer 1 spec, verbatim. Never edited.
- `SPEC-DRAFT.md` — amendments to it, each with its evidence and status.
- `LEDGER.md` — one row per round: checkpoint on `main`, headline numbers, scores.
- `rounds/NN-*.md` — each round's report. `rounds/NN/` — its raw JSON and
  `summary.txt`.
- `scripts/retro.py` — measurements (stdlib Python, run from the repo root).
- `scripts/summarize.py` — prints the numbers a report cites.

## Running a round

Needs full history (`git fetch --unshallow origin main` once per container).

```sh
R=sandbox/loc-retro/rounds/NN; mkdir -p $R
S=sandbox/loc-retro/scripts
python3 -I $S/retro.py prs --k K > $R/prs.json
python3 -I $S/retro.py --literals prs --k K --flags $R/flags.json > $R/prs_t2.json
python3 -I $S/retro.py deaths --k K > $R/deaths.json
python3 -I $S/retro.py recon > $R/recon.json
python3 -I $S/retro.py --literals recon > $R/recon_t2.json
# score every earlier round's flags against today's main:
python3 -I $S/retro.py score --flags sandbox/loc-retro/rounds/00/flags.json > $R/score_r00.json
python3 -I $S/summarize.py $R --trim <PRs> --feature <PRs> > $R/summary.txt
```

`K` is the number of merged PRs since the previous checkpoint (`LEDGER.md`).
`--trim` / `--feature` are the round's hand classification of PRs; state it in
the report.

## Definitions

- **Code** — files classed `source`, `test` or `stories` by `category()` in
  `retro.py`. Generated files, lockfiles, docs and config are counted but never
  flagged.
- **Clone** — a line inside a window of 6 consecutive significant lines that
  occurs at least twice in the tree at that commit. Significant drops blank,
  punctuation-only, import and comment lines. `--literals` replaces string and
  number literals by a placeholder first (Type-2 clones). `flags.json` records
  Type-2.
- **Trim** — a PR that cuts slack out of live code without changing behavior.
  **Retire** — a PR that removes a whole feature or workspace (a product
  decision no generation-time rule could prevent).
- **Death** — a line added by a PR that `git blame -w -M` at a later head no
  longer attributes to that PR. A move across files counts as a death (no `-C`).
- **Lift** — the death rate of a flag class divided by the death rate of all
  added code lines in the same PRs.
