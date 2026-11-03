# REVIEW.md

Review rules for this repository, for human reviewers and the review bot alike. Style and
correctness conventions live in `CLAUDE.md`; this file covers how to review against them.

## Declared invariants: check the falsifier, then stop

Some rules here cannot be enforced by lint, types, or tests. They are declared as
invariants with an ID (for example `L3`) and four parts: **Claim**, **Falsified by**,
**Scope**, **Why not enforced**. See `CLAUDE.md`, "Gray-area invariants: declare them
falsifiable", for the format. The first full set is the resource-lifetime invariants L1–L8 in
`extensions/common/GOOD_CITIZEN.md` → "Resource lifetimes: what is enforced, and what is
not"; the build-audience invariants A1–A4 are in `packages/some-vite-config/AUDIENCES.md`,
and some-drama's live-playback invariants LP1–LP3 in `extensions/some-drama/README.md` → "Live
playback: what is enforced, and what is not"; R1 (coordination in React modules) in
`docs/monorepo-boundaries.md` → "Inside a React package: the component is not the
coordinator", F1 (waits on foreign APIs) beside it in "A port translates: the foreign
boundary", and FT2 (a catch that drops its error says why) in "A failure reaches the
log". Modules they govern carry a one-line summary per
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

`pnpm check:policy-docs` already fails a declaration missing a part, an ID declared twice and an
ID dropped since the base branch (`CLAUDE.md`, "Gray-area invariants: declare them
falsifiable"), so do not re-check those. Flag the declaration itself when it:

- has a part that is there in name only, or a **Falsified by** that can't be decided from the
  hunk and the file it changes (advice, or a claim about the whole program);
- has a **Falsified by** that covers only additions, missing a deletion, rename or move
  that would also make the claim false;
- covers something a lint rule, type or test could enforce, without saying why that
  mechanism fails, or without the label "mechanical; not yet a rule";
- is false on the code in the same change;
- gives an ID already used at the base a different claim.

## Second implementations and code left behind

A duplicate passes every lint, type and test, so review is the only place it is caught,
and agents add code far more readily than they reuse or remove it. Check three things.
Each one found is a **blocking** finding, never a nit, suggestion or optional comment:

1. **Copies inside the diff.** Two added files, components or functions that are the same
   code with names, strings or classes changed. #1600 added LeetType's `RoundShelf` and
   TOPIK's `LessonShelf` this way, and #1641 merges them.
2. **A parallel implementation of something that exists.** An added module, component,
   hook or helper whose job existing code already does. Search before flagging: look for the
   added exports' names and close synonyms in `packages/ui/shared`, `packages/core-utils`,
   `packages/react-hooks` and the sibling workspaces of the one the diff touches. Flag only with the existing code's
   path in hand.
3. **Code left behind.** A diff that moves callers to a new way of doing something and
   keeps the old one, now with fewer callers or none. Likewise a behavior change that adds
   a new test beside the existing test of that behavior instead of changing that test.
   Removing what the change made redundant is in scope for the same PR (`CLAUDE.md`,
   "Deleting is in scope").

No finding when the PR body's **Superseded** section names the existing code and says why
both must exist. Whether that reason holds is for a person to judge. PRs a workflow opens with a
fixed body (release, Changesets and snapshot PRs) carry generated content and are exempt.

## Change kind: a defect PR proves its claim

Every commit but a merge or a revert carries a `Change-Kind: story` or `Change-Kind: defect`
trailer. The commit that declares or amends a promise, or a story that raises one's
Tolerance, adds `Promise:`, and a defect adds `Relates:` where it applies (`CLAUDE.md`, "Two kinds of pull
request"). Each of the following is a **blocking** finding:

1. **The wrong kind.** A `story` PR whose stated purpose is a failure in a state its story
   already covered is a defect. A `defect` PR whose failure lies inside an existing promise's
   Tolerance is a story: it raises the promise.
2. **A defect with no promise.** A `defect` PR that declares or amends no promise with an ID,
   Claim, Family and Proof, or no `Promise:` trailer naming it, or whose Family is only the
   reported case.
3. **A claim wider than its proof.** A Proof that does not reach every dimension of the Family
   it names. For example, a test of one interleaving offered for "every interleaving of stop
   and resume".
4. **A missing relation.** A `defect` PR whose failing state lies inside a declared promise's
   Family (Breaks), its scope (Widens), or turns on a dimension its Family names (Shares),
   with no `Relates:` trailer naming that promise.
5. **No account of the happy path.** A `defect` PR that does not say which check could have
   caught the failure and why none did, or, for Breaks, Widens and Shares, why the earlier
   PR missed this state.

A `story` PR has nothing to prove: do not ask it for a claim, a family or a proof. A promise
declared as a gray-area invariant is also reviewed under "Reviewing a change that declares or
edits an invariant" above. Commits a workflow or a bot writes are exempt. A person's or an
agent's commit on a bot's PR is not.

## The phone is Android only

No finding whose failure reproduces only on iOS, iPadOS or Safari: those platforms are not
targets, and whatever works there does so by coincidence (`CLAUDE.md`, "The phone and
the desktop web are separate surfaces"). The reverse is a **blocking** finding, since the fix is only deletion: a hunk that adds
code, a test, a fallback or a comment for them (a `webkit`-prefixed global Chrome does not
need, an Apple meta tag, a Safari-version workaround, an iPhone branch).
`pnpm check:android-only` already fails the tokens `CLAUDE.md` lists (in "The phone and the
desktop web are separate surfaces"), so do not re-check those. What stays for review is
anything they do not reach: another spelling, a prose file, any other line that exists for them.

## The assurance ledger says what the code does

`packages/assurance/src/ledger.json` records each promise about outcomes and work with a
verdict (`docs/operational-assurance.md`). `pnpm check:assurance` already fails its shape, a
`holds` with no proof that exists, anything else with no issue, an unplaced server route
module, a family no process in the registry serves, a registry name that points at nothing, and
a weakening against the base branch with no amendment, so do not re-check those.
Each of the following is a **blocking** finding:

1. **A verdict the evidence does not carry.** A `holds` whose proof does not reach its
   requirement (a test of one case for a claim about every pass, say), or a conclusion that
   drops the boundary its evidence states (local SQLite steps called D1 rows).
2. **Code that makes a ledger claim false, with the ledger unchanged.** A hunk that removes or
   renames what a proof names, or the alert or dashboard a `watch` names, or that changes what an
   objective's requirement describes, without the matching ledger edit. A `server:` path is
   checked by the server's `Assurance ledger` job (server#557), but only on server pull requests, so
   a some-ui PR that touches an objective with a `server:` proof still confirms the path exists.
3. **An amendment without the owner.** A new amendment whose `decision` does not link to the
   owner deciding that change, or whose `change` does not say what the objective lost.
4. **A route module called synchronous that is not.** A module added to `synchronous` whose
   caller does not see the outcome in the answer (the work finishes later, in a pass or a
   queue).
5. **A registry entry that no longer says what runs.** A hunk that adds a new async process (a
   background pass, a phone flow that ends later) inside a family listed as `crosscutting`, or
   that moves work across an ownership boundary (a new plugin, a new service) without its
   segment, or a `live` signal or check whose `ref` no longer does what its `says` or `name`
   claims.
