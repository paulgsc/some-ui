# REVIEW.md

Review rules for this repository, for human reviewers and the review bot alike. Style and
correctness conventions live in `CLAUDE.md`; this file covers how to review against them.

## Declared invariants: check the falsifier, then stop

Some rules here cannot be enforced by lint, types, or tests. They are declared as
invariants with an ID (for example `L3`) and four parts: **Claim**, **Falsified by**,
**Scope**, **Why not enforced**. See `CLAUDE.md`, "Gray-area invariants: declare them
falsifiable", for the format. The first full set is the resource-lifetime invariants L1–L8 in
`extensions/common/GOOD_CITIZEN.md` → "Resource lifetimes: what is enforced, and what is
not"; the build-audience invariants A1–A3 are in `packages/some-vite-config/AUDIENCES.md`,
and some-drama's live-playback invariants LP1–LP3 in `extensions/some-drama/README.md` → "Live
playback: what is enforced, and what is not". Modules they govern carry a one-line summary per
ID in their doc comment.

When a hunk falls inside an invariant's **Scope**:

1. Evaluate the hunk against that invariant's **Falsified by** line, using only the hunk,
   the file it changes (as it stands after the diff), and any files that line names.
2. **Null (nothing in the hunk matches):** no comment. Do not go on to explore other states,
   call paths or configurations to look for a violation somewhere else. The invariant was
   written so this check is the whole check.
3. **Alt (the hunk matches):** one finding, citing the invariant ID, the matching lines,
   and the claim they contradict. That is a regression: every declared invariant held when
   it was written.

An invariant marked **"not reviewable"** is never flagged on a hunk; it names where it is
tracked.

## Reviewing a change that declares or edits an invariant

Flag the declaration itself when it:

- is missing any of the four parts, or has a **Falsified by** that can't be decided from the hunk
  and the file it changes (advice, or a claim about the whole program);
- has a **Falsified by** that covers only additions, missing a deletion, rename or move
  that would also make the claim false;
- covers something a lint rule, type or test could enforce, without saying why that
  mechanism fails, or without the label "mechanical; not yet a rule";
- is false on the code in the same change;
- renumbers an existing ID, or removes one instead of marking it retired with a reason.
