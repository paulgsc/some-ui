# AGENTS.md

Conventions for this repository live in `CLAUDE.md`, and review rules in `REVIEW.md`. Both
apply to any agent working here, not only Claude.

## Review guidelines

- **Declared invariants: check the falsifier, then stop.** Some rules here cannot be
  enforced by lint, types or tests, so they are declared as invariants with an ID (e.g.
  `L3`) and four parts: Claim, Falsified by, Scope, Why not enforced (format:
  `CLAUDE.md`, "Gray-area invariants: declare them falsifiable"). For a hunk inside an
  invariant's Scope, evaluate only its **Falsified by** line, against the hunk, the
  file it changes (after the diff), and any files that line names:
  - **nothing matches:** no comment, and no search of other states or call paths for a
    violation elsewhere;
  - **it matches:** one finding citing the ID and the lines. Invariants marked "not
    reviewable" are never flagged.
- **A change that declares or edits an invariant:** flag it if it is missing a part, has a
  falsifier that can't be decided from the hunk and the file it changes, or that covers only additions (missing a deletion, rename or move that also breaks the claim), covers something a lint rule, type or
  test could enforce without saying why that fails, is false on the code in the same
  change, or renumbers or removes an ID instead of retiring it.

Full text: `REVIEW.md`.
