# AGENTS.md

Conventions for this repository live in `CLAUDE.md`, and review rules in `REVIEW.md`. Both
apply to any agent working here, not only Claude.

## Review guidelines

- **Declared invariants: check the falsifier, then stop.** Some rules here cannot be
  enforced by lint, types or tests, so they are declared as invariants with an ID (e.g.
  `L3`) and four parts: Claim, Falsified by, Scope, Why not enforced (format:
  `CLAUDE.md`, "Gray-area invariants: declare them falsifiable"). The sets: L1–L8 in
  `extensions/common/GOOD_CITIZEN.md`, A1–A4 in `packages/some-vite-config/AUDIENCES.md`,
  LP1–LP3 in `extensions/some-drama/README.md`, R1 and F1 in `docs/monorepo-boundaries.md`.
  For a hunk inside an invariant's Scope, evaluate only its **Falsified by** line, against
  the hunk, the file it changes (after the diff), and any files that line names:
  - **nothing matches:** no comment, and no search of other states or call paths for a
    violation elsewhere;
  - **it matches:** one finding citing the ID and the lines. Invariants marked "not
    reviewable" are never flagged.
- **Reviewing a change that declares or edits an invariant:** `pnpm check:policy-docs` already fails a
  missing part, a reused ID and a dropped one; do not re-check those. Flag it if it has a part
  that is there in name only, a falsifier that can't be decided from the hunk and the file it
  changes, or that covers only additions (missing a deletion, rename or move that also breaks
  the claim), covers something a lint rule, type or test could enforce without saying why that
  fails, is false on the code in the same change, or gives an ID already in use a different claim.
- **Second implementations and code left behind are blocking findings.** Flag two
  copies of the same code added in one diff; an added module, component, hook or helper
  whose job existing code already does (search `packages/ui/shared`, `packages/core-utils`,
  `packages/react-hooks` and sibling workspaces first, and cite the existing path); and old code or tests a change
  replaced but kept. No finding when the PR body's **Superseded** section names the
  existing code and says why both must exist.
- **Change kind: a defect PR proves its claim.** Every commit but a merge or revert
  carries `Change-Kind: story` or `Change-Kind: defect`; the commit that declares or amends
  a promise adds `Promise:`, and a defect adds `Relates:` where it applies.
  Blocking when a `story` PR's purpose is a failure its story already covered (or a
  `defect` sits inside a promise's Tolerance); a `defect` PR declares no promise (ID,
  Claim, Family, Proof, and a `Promise:` trailer) or names only the reported case as its
  family; its proof misses a
  dimension of the family it names; its failing state lies in a declared promise's family
  or scope, or turns on a dimension that family names, with no `Relates:` naming it; or it
  does not say which check could have caught the failure. Ask a `story` PR to prove nothing. Issues are labelled `kind:story` or
  `kind:defect` the same way.
- **The phone is Android only.** No finding that reproduces only on iOS, iPadOS or
  Safari. A hunk that adds code, a test, a fallback or a comment for them is blocking.
  `pnpm check:android-only` already fails the tokens `CLAUDE.md` lists; what stays is anything
  they do not reach (another spelling, a prose file, any other line that exists for them).

Full text: `REVIEW.md`.
